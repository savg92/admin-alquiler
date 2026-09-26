import "reflect-metadata";
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { CommunicationsController } from "../src/communications/communications.controller";
import { CommunicationsService } from "../src/communications/communications.service";
import type {
  CommsChannel,
  CommunicationsStore,
  NotificationRow,
} from "../src/communications/store";
import { COMMUNICATIONS_STORE } from "../src/communications/tokens";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { RequestIdMiddleware } from "../src/request-id.middleware";

const TEST_SECRET = "test-secret-with-at-least-32-characters!!";

class FakeAuthStore implements AuthStore {
  users = new Map<string, UserRow>();
  sessions = new Map<string, SessionRow>();
  memberships = new Map<string, MembershipRow[]>();

  async findUserByEmail(email: string): Promise<UserRow | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    return this.users.get(id) ?? null;
  }

  async createSession(data: { userId: string; expiresAt: Date }): Promise<{ id: string }> {
    const id = `session-${this.sessions.size + 1}`;
    this.sessions.set(id, { id, userId: data.userId, expiresAt: data.expiresAt, rotatedAt: null });
    return { id };
  }

  async findSessionById(id: string): Promise<SessionRow | null> {
    return this.sessions.get(id) ?? null;
  }

  async touchSession(): Promise<void> {}

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async listMemberships(userId: string): Promise<MembershipRow[]> {
    return this.memberships.get(userId) ?? [];
  }

  async writeAuditEvent(): Promise<void> {}
}

class FakeCommsStore implements CommunicationsStore {
  notifications: (NotificationRow & { orgId: string })[] = [];
  preferences = new Map<string, boolean>();
  audits: string[] = [];

  async createNotification(
    orgId: string,
    data: { userId: string | null; channel: CommsChannel; title: string; body: string },
  ): Promise<NotificationRow> {
    const row = {
      id: `notif-${this.notifications.length + 1}`,
      orgId,
      ...data,
      readAt: null,
      createdAt: new Date(),
    };
    this.notifications.push(row);
    const { orgId: _o, ...rest } = row;
    return rest;
  }

  async listNotifications(orgId: string, userId: string, unreadOnly?: boolean) {
    return this.notifications
      .filter(
        (row) =>
          row.orgId === orgId &&
          (row.userId === userId || row.userId === null) &&
          (unreadOnly !== true || row.readAt === null),
      )
      .map(({ orgId: _o, ...rest }) => rest);
  }

  async markNotificationRead(id: string, orgId: string, userId: string) {
    const found = this.notifications.find(
      (row) =>
        row.id === id && row.orgId === orgId && (row.userId === userId || row.userId === null),
    );
    if (!found) {
      return null;
    }
    found.readAt = new Date();
    const { orgId: _o, ...rest } = found;
    return rest;
  }

  async getPreferences(orgId: string, userId: string) {
    const out: { userId: string; channel: CommsChannel; enabled: boolean }[] = [];
    for (const channel of ["IN_APP", "EMAIL"] as const) {
      const key = `${orgId}:${userId}:${channel}`;
      if (this.preferences.has(key)) {
        out.push({ userId, channel, enabled: this.preferences.get(key) ?? true });
      }
    }
    return out;
  }

  async setPreference(orgId: string, userId: string, channel: CommsChannel, enabled: boolean) {
    this.preferences.set(`${orgId}:${userId}:${channel}`, enabled);
    return { userId, channel, enabled };
  }

  async isChannelEnabled(orgId: string, userId: string | null, channel: CommsChannel) {
    if (userId === null) {
      return true;
    }
    return this.preferences.get(`${orgId}:${userId}:${channel}`) ?? true;
  }

  async createCommunication(
    orgId: string,
    data: {
      sender: string;
      recipients: Record<string, unknown>;
      subject: string | null;
      body: string;
      locale: string;
    },
  ) {
    const row = {
      id: `comm-${this.communications.length + 1}`,
      orgId,
      ...data,
      sentAt: new Date(),
    };
    this.communications.push(row);
    const { orgId: _o, ...rest } = row;
    return rest;
  }

  communications: {
    id: string;
    orgId: string;
    sender: string;
    recipients: Record<string, unknown>;
    subject: string | null;
    body: string;
    locale: string;
    sentAt: Date;
  }[] = [];

  async listCommunications(orgId: string) {
    return this.communications
      .filter((row) => row.orgId === orgId)
      .map(({ orgId: _o, ...rest }) => rest);
  }

  templates: {
    id: string;
    orgId: string | null;
    key: string;
    locale: string;
    subject: string | null;
    body: string;
  }[] = [];

  async upsertTemplate(
    orgId: string | null,
    data: { key: string; locale: string; subject: string | null; body: string },
  ) {
    const existing = this.templates.find(
      (row) =>
        (row.orgId ?? null) === (orgId ?? null) &&
        row.key === data.key &&
        row.locale === data.locale,
    );
    if (existing) {
      existing.subject = data.subject;
      existing.body = data.body;
      return existing;
    }
    const row = { id: `tpl-${this.templates.length + 1}`, orgId, ...data };
    this.templates.push(row);
    return row;
  }

  async findTemplate(orgId: string, key: string, locale: string) {
    return (
      this.templates.find(
        (row) => row.orgId === orgId && row.key === key && row.locale === locale,
      ) ??
      this.templates.find(
        (row) => row.orgId === null && row.key === key && row.locale === locale,
      ) ??
      null
    );
  }

  async listTemplates(orgId: string) {
    return this.templates.filter((row) => row.orgId === orgId || row.orgId === null);
  }

  outbox: {
    id: string;
    orgId: string;
    type: string;
    payload: Record<string, unknown>;
    processedAt: Date | null;
    attempts: number;
  }[] = [];

  async enqueueOutbox(
    orgId: string,
    aggregateType: string,
    aggregateId: string,
    type: string,
    payload: Record<string, unknown>,
  ) {
    void aggregateType;
    void aggregateId;
    const row = {
      id: `out-${this.outbox.length + 1}`,
      orgId,
      type,
      payload,
      processedAt: null,
      attempts: 0,
    };
    this.outbox.push(row);
    return { id: row.id, type: row.type, processedAt: row.processedAt, attempts: row.attempts };
  }

  async pendingOutbox(orgId: string) {
    return this.outbox
      .filter((row) => row.orgId === orgId && row.processedAt === null)
      .map((row) => ({
        id: row.id,
        type: row.type,
        processedAt: row.processedAt,
        attempts: row.attempts,
        payload: row.payload as unknown,
      }));
  }

  async markOutboxProcessed(id: string, error: string | null): Promise<void> {
    const found = this.outbox.find((row) => row.id === id);
    if (!found) {
      return;
    }
    if (error === null) {
      found.processedAt = new Date();
    } else {
      found.attempts += 1;
    }
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const authStore = new FakeAuthStore();
const commsStore = new FakeCommsStore();

@Module({
  controllers: [AuthController, CommunicationsController],
  providers: [
    AuthService,
    CommunicationsService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: COMMUNICATIONS_STORE, useValue: commsStore },
  ],
})
class CommsTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}

let app: INestApplication;
let baseUrl: string;
let token = "";

function headers(org = "org-a"): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "X-Org-Id": org, "Content-Type": "application/json" };
}

beforeAll(async () => {
  authStore.users.set("user-1", {
    id: "user-1",
    email: "admin@ejemplo.co",
    passwordHash: hashPassword("correct-horse-1"),
    name: "Admin",
  });
  authStore.memberships.set("user-1", [
    {
      orgId: "org-a",
      status: "ACTIVE",
      roleName: "admin",
      permissions: ["communication:read", "communication:write"],
    },
  ]);
  app = await NestFactory.create(CommsTestModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@ejemplo.co", password: "correct-horse-1" }),
  });
  token = ((await login.json()) as { accessToken: string }).accessToken;
});

afterAll(async () => {
  await app?.close();
});

describe("notifications and preferences", () => {
  test("creates, lists, filters unread and marks read", async () => {
    const created = (await (
      await fetch(`${baseUrl}/api/v1/notifications`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          userId: "user-1",
          channel: "IN_APP",
          title: "Cuota vencida",
          body: "La cuota de febrero vence mañana.",
        }),
      })
    ).json()) as { id: string; readAt: null };
    expect(created.id).toBeDefined();
    expect(created.readAt).toBeNull();
    const mine = (await (
      await fetch(`${baseUrl}/api/v1/notifications/mine`, { headers: headers() })
    ).json()) as { id: string }[];
    expect(mine.map((row) => row.id)).toContain(created.id);
    const read = await fetch(`${baseUrl}/api/v1/notifications/${created.id}/read`, {
      method: "POST",
      headers: headers(),
    });
    expect(read.status).toBe(201);
    const unread = (await (
      await fetch(`${baseUrl}/api/v1/notifications/mine?unreadOnly=true`, { headers: headers() })
    ).json()) as { id: string }[];
    expect(unread.map((row) => row.id)).not.toContain(created.id);
    expect(commsStore.audits).toContain("notification.sent");
  });

  test("preferences gate channel delivery per user", async () => {
    const set = await fetch(`${baseUrl}/api/v1/notification-preferences`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ channel: "EMAIL", enabled: false }),
    });
    expect(set.status).toBe(201);
    const prefs = (await (
      await fetch(`${baseUrl}/api/v1/notification-preferences/mine`, { headers: headers() })
    ).json()) as { userId: string; channel: string; enabled: boolean }[];
    expect(prefs).toContainEqual({ userId: "user-1", channel: "EMAIL", enabled: false });
    const blocked = await fetch(`${baseUrl}/api/v1/notifications`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        userId: "user-1",
        channel: "EMAIL",
        title: "Aviso",
        body: "No debe llegar.",
      }),
    });
    expect(blocked.status).toBe(400);
    const allowed = await fetch(`${baseUrl}/api/v1/notifications`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        userId: "user-1",
        channel: "IN_APP",
        title: "Aviso",
        body: "Sí llega.",
      }),
    });
    expect(allowed.status).toBe(201);
  });
});
