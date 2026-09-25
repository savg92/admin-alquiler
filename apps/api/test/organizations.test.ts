import "reflect-metadata";
import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { signAccessToken } from "@admin-alquiler/auth";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { RequestIdMiddleware } from "../src/request-id.middleware";
import { OrganizationsController } from "../src/organizations/organizations.controller";
import { OrganizationsService } from "../src/organizations/organizations.service";
import type { MemberRow, OrgsStore } from "../src/organizations/store";
import { ORGS_STORE } from "../src/organizations/tokens";

const TEST_SECRET = "test-secret-with-at-least-32-characters!!";

class FakeAuthStore implements AuthStore {
  sessions = new Map([["session-admin", { userId: "admin-1" }]]);
  memberships: Record<string, MembershipRow[]> = {
    "admin-1": [
      {
        orgId: "org-a",
        status: "ACTIVE",
        roleName: "admin",
        permissions: ["member:read", "member:write", "role:write"],
      },
    ],
    "plain-1": [
      { orgId: "org-a", status: "ACTIVE", roleName: "member", permissions: ["member:read"] },
    ],
  };

  async findUserByEmail(): Promise<null> {
    return null;
  }

  async findUserById(): Promise<null> {
    return null;
  }

  async createSession(): Promise<{ id: string }> {
    return { id: "session-admin" };
  }

  async findSessionById(id: string) {
    const entry = this.sessions.get(id);
    if (!entry) {
      return null;
    }
    return {
      id,
      userId: entry.userId,
      expiresAt: new Date(Date.now() + 3_600_000),
      rotatedAt: null,
    };
  }

  async touchSession(): Promise<void> {}

  async deleteSession(): Promise<void> {}

  async listMemberships(userId: string): Promise<MembershipRow[]> {
    return this.memberships[userId] ?? [];
  }

  async writeAuditEvent(): Promise<void> {}
}

class FakeOrgsStore implements OrgsStore {
  members = new Map<string, MemberRow>([
    ["org-a:admin-1", { userId: "admin-1", orgId: "org-a", status: "ACTIVE", roleName: "admin" }],
    ["org-a:plain-1", { userId: "plain-1", orgId: "org-a", status: "ACTIVE", roleName: "member" }],
  ]);

  roles = new Map([
    ["role-admin", { id: "role-admin", name: "admin" }],
    ["role-member", { id: "role-member", name: "member" }],
  ]);

  audits: string[] = [];

  async findOrgBySlug(): Promise<{ id: string } | null> {
    return { id: "org-a" };
  }

  async findOrgById(id: string): Promise<{ id: string } | null> {
    return id === "org-a" ? { id } : null;
  }

  async createOrg(): Promise<never> {
    throw new Error("not implemented");
  }

  async ensureAdminRole(): Promise<{ id: string; name: string }> {
    return { id: "role-admin", name: "admin" };
  }

  async createMembership(): Promise<void> {}

  async listMembers(orgId: string): Promise<MemberRow[]> {
    return [...this.members.values()].filter((member) => member.orgId === orgId);
  }

  async findMembership(orgId: string, userId: string): Promise<MemberRow | null> {
    return this.members.get(`${orgId}:${userId}`) ?? null;
  }

  async findRoleByName(_orgId: string, name: string): Promise<{ id: string; name: string } | null> {
    for (const role of this.roles.values()) {
      if (role.name === name) {
        return role;
      }
    }
    return null;
  }

  async updateMembership(
    orgId: string,
    userId: string,
    data: { roleId?: string; status?: "ACTIVE" | "SUSPENDED" | "REVOKED" },
  ): Promise<MemberRow> {
    const current = this.members.get(`${orgId}:${userId}`);
    if (!current) {
      throw new Error("Membership not found.");
    }
    const roleName =
      data.roleId === undefined
        ? current.roleName
        : ([...this.roles.values()].find((role) => role.id === data.roleId)?.name ??
          current.roleName);
    const updated: MemberRow = {
      ...current,
      roleName,
      status: data.status ?? current.status,
    };
    this.members.set(`${orgId}:${userId}`, updated);
    return updated;
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const authStore = new FakeAuthStore();
const orgsStore = new FakeOrgsStore();

@Module({
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: ORGS_STORE, useValue: orgsStore },
  ],
})
class OrgsTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}

let app: INestApplication;
let baseUrl: string;

function tokenFor(userId: string, sessionId: string): string {
  return signAccessToken(TEST_SECRET, { id: userId, email: `${userId}@ejemplo.co` }, sessionId);
}

beforeAll(async () => {
  authStore.sessions.set("session-plain", { userId: "plain-1" });
  app = await NestFactory.create(OrgsTestModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe("organization members", () => {
  test("admin lists members", async () => {
    const response = await fetch(`${baseUrl}/api/v1/organizations/org-a/members`, {
      headers: {
        Authorization: `Bearer ${tokenFor("admin-1", "session-admin")}`,
        "X-Org-Id": "org-a",
      },
    });
    expect(response.status).toBe(200);
    const members = (await response.json()) as MemberRow[];
    expect(members.map((member) => member.userId).sort()).toEqual(["admin-1", "plain-1"]);
  });

  test("admin changes a member role (audited)", async () => {
    const response = await fetch(`${baseUrl}/api/v1/organizations/org-a/members/plain-1`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenFor("admin-1", "session-admin")}`,
        "X-Org-Id": "org-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roleName: "admin" }),
    });
    expect(response.status).toBe(200);
    const updated = (await response.json()) as MemberRow;
    expect(updated.roleName).toBe("admin");
    expect(orgsStore.audits).toContain("member.role_changed");
  });

  test("admin suspends a member (audited)", async () => {
    const response = await fetch(`${baseUrl}/api/v1/organizations/org-a/members/plain-1`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenFor("admin-1", "session-admin")}`,
        "X-Org-Id": "org-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as MemberRow).status).toBe("SUSPENDED");
    expect(orgsStore.audits).toContain("member.status_changed");
  });

  test("member without role:write is denied", async () => {
    const response = await fetch(`${baseUrl}/api/v1/organizations/org-a/members/plain-1`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenFor("plain-1", "session-plain")}`,
        "X-Org-Id": "org-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    expect(response.status).toBe(403);
  });

  test("cross-org scope mismatch is denied", async () => {
    const response = await fetch(`${baseUrl}/api/v1/organizations/org-b/members/plain-1`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenFor("admin-1", "session-admin")}`,
        "X-Org-Id": "org-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    expect(response.status).toBe(403);
  });

  test("admin cannot change their own membership", async () => {
    const response = await fetch(`${baseUrl}/api/v1/organizations/org-a/members/admin-1`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenFor("admin-1", "session-admin")}`,
        "X-Org-Id": "org-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    expect(response.status).toBe(403);
  });

  test("unknown role and unknown member fail", async () => {
    const headers = {
      Authorization: `Bearer ${tokenFor("admin-1", "session-admin")}`,
      "X-Org-Id": "org-a",
      "Content-Type": "application/json",
    };
    const badRole = await fetch(`${baseUrl}/api/v1/organizations/org-a/members/plain-1`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ roleName: "superadmin" }),
    });
    expect(badRole.status).toBe(404);
    const badMember = await fetch(`${baseUrl}/api/v1/organizations/org-a/members/ghost-9`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    expect(badMember.status).toBe(404);
  });
});
