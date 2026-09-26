import "reflect-metadata";
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import { AuditController } from "../src/audit/audit.controller";
import { AuditService } from "../src/audit/audit.service";
import type { AuditStore } from "../src/audit/store";
import { AUDIT_STORE } from "../src/audit/tokens";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
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

class FakeAuditStore implements AuditStore {
  async listAuditEvents() {
    return [
      {
        id: "audit-1",
        action: "document.created",
        entityType: "Document",
        entityId: "doc-1",
        actorId: "user-1",
        createdAt: new Date(),
      },
    ];
  }
}

const authStore = new FakeAuthStore();

@Module({
  controllers: [AuthController, AuditController],
  providers: [
    AuthService,
    AuditService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: AUDIT_STORE, useValue: new FakeAuditStore() },
  ],
})
class AuditTestModule implements NestModule {
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
    { orgId: "org-a", status: "ACTIVE", roleName: "admin", permissions: ["report:read"] },
  ]);
  app = await NestFactory.create(AuditTestModule, { logger: false });
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

describe("audit trail", () => {
  test("lists org-scoped events with filters", async () => {
    const events = (await (
      await fetch(`${baseUrl}/api/v1/audit-events?action=document.created`, { headers: headers() })
    ).json()) as { action: string }[];
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("document.created");
  });

  test("rejects bad limits, missing org and missing permission", async () => {
    expect(
      (await fetch(`${baseUrl}/api/v1/audit-events?limit=9999`, { headers: headers() })).status,
    ).toBe(400);
    expect(
      (await fetch(`${baseUrl}/api/v1/audit-events`, { headers: headers("org-b") })).status,
    ).toBe(403);
    const anonymous = await fetch(`${baseUrl}/api/v1/audit-events`);
    expect(anonymous.status).toBe(403);
  });
});
