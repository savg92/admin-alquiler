import "reflect-metadata";
import { Controller, Get, MiddlewareConsumer, Module, NestModule, UseGuards } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard, RequirePermission } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { RequestIdMiddleware } from "../src/request-id.middleware";

const TEST_SECRET = "test-secret-with-at-least-32-characters!!";

class FakeAuthStore implements AuthStore {
  users = new Map<string, UserRow>();
  sessions = new Map<string, SessionRow>();
  memberships = new Map<string, MembershipRow[]>();
  audits: string[] = [];

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

  async touchSession(id: string, rotatedAt: Date, expiresAt: Date): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      this.sessions.set(id, { ...session, rotatedAt, expiresAt });
    }
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async listMemberships(userId: string): Promise<MembershipRow[]> {
    return this.memberships.get(userId) ?? [];
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const store = new FakeAuthStore();

@Controller("test")
class GuardedController {
  @Get("property")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission("property:write")
  property() {
    return { ok: true };
  }
}

@Module({
  controllers: [AuthController, GuardedController],
  providers: [
    AuthService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: store },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
  ],
})
class AuthTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  store.users.set("user-1", {
    id: "user-1",
    email: "admin@ejemplo.co",
    passwordHash: hashPassword("correct-horse-1"),
    name: "Admin",
  });
  store.memberships.set("user-1", [
    { orgId: "org-a", status: "ACTIVE", roleName: "admin", permissions: ["property:write"] },
  ]);
  app = await NestFactory.create(AuthTestModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

async function login(email: string, password: string) {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("auth endpoints", () => {
  test("login with valid credentials returns an access token", async () => {
    const response = await login("admin@ejemplo.co", "correct-horse-1");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { accessToken: string; user: { id: string } };
    expect(typeof body.accessToken).toBe("string");
    expect(body.user.id).toBe("user-1");
    expect(store.audits).toContain("auth.login");
  });

  test("login with wrong password returns 401 without distinguishing", async () => {
    const wrong = await login("admin@ejemplo.co", "wrong-password-2");
    expect(wrong.status).toBe(401);
    const unknown = await login("nobody@ejemplo.co", "wrong-password-2");
    expect(unknown.status).toBe(401);
  });

  test("me returns identity with memberships for a valid token", async () => {
    const loginResponse = await login("admin@ejemplo.co", "correct-horse-1");
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      memberships: { orgId: string; permissions: string[] }[];
    };
    expect(body.id).toBe("user-1");
    expect(body.memberships[0]?.orgId).toBe("org-a");
  });

  test("me without a token returns 403", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/me`);
    expect(response.status).toBe(403);
  });

  test("logout revokes the session", async () => {
    const loginResponse = await login("admin@ejemplo.co", "correct-horse-1");
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };
    const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(logout.status).toBe(204);
    const me = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(me.status).toBe(403);
    expect(store.audits).toContain("auth.logout");
  });

  test("tampered tokens are rejected", async () => {
    const loginResponse = await login("admin@ejemplo.co", "correct-horse-1");
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };
    const segments = accessToken.split(".");
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${segments[0]}.${segments[1]}x.${segments[2]}` },
    });
    expect(response.status).toBe(403);
  });
});

describe("server-side permission guard", () => {
  async function getProperty(token: string | null, org?: string) {
    return fetch(`${baseUrl}/test/property`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(org ? { "X-Org-Id": org } : {}),
      },
    });
  }

  test("allows same-org actors with the permission", async () => {
    const { accessToken } = (await (await login("admin@ejemplo.co", "correct-horse-1")).json()) as {
      accessToken: string;
    };
    expect((await getProperty(accessToken, "org-a")).status).toBe(200);
  });

  test("denies cross-org access and missing org scope", async () => {
    const { accessToken } = (await (await login("admin@ejemplo.co", "correct-horse-1")).json()) as {
      accessToken: string;
    };
    expect((await getProperty(accessToken, "org-b")).status).toBe(403);
    expect((await getProperty(accessToken)).status).toBe(403);
  });

  test("denies unauthenticated callers", async () => {
    expect((await getProperty(null, "org-a")).status).toBe(403);
  });
});
