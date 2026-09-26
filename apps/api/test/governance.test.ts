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
import { GovernanceController } from "../src/governance/governance.controller";
import { GovernanceService } from "../src/governance/governance.service";
import type { GovernanceStore } from "../src/governance/store";
import { GOVERNANCE_STORE } from "../src/governance/tokens";
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

class FakeGovernanceStore implements GovernanceStore {
  properties = new Map<string, { id: string; orgId: string; phEnabled: boolean }>([
    ["prop-1", { id: "prop-1", orgId: "org-a", phEnabled: true }],
  ]);
  shares = new Map<string, { ownerId: string; sharePct: number }[]>([
    [
      "prop-1",
      [
        { ownerId: "owner-a", sharePct: 70 },
        { ownerId: "owner-b", sharePct: 30 },
      ],
    ],
  ]);
  acts: {
    id: string;
    orgId: string;
    propertyId: string;
    heldAt: Date;
    attendance: { ownerId: string; sharePct: number; proxyTo?: string | null }[];
    quorumMet: boolean;
  }[] = [];
  decisions: {
    id: string;
    assemblyActId: string;
    title: string;
    description: string | null;
    majority: "ORDINARY" | "QUALIFIED";
  }[] = [];
  votes: {
    id: string;
    decisionId: string;
    ownerId: string | null;
    weight: number;
    choice: "APPROVE" | "REJECT" | "ABSTAIN";
  }[] = [];
  audits: string[] = [];

  async findProperty(id: string, orgId: string) {
    const found = this.properties.get(id);
    if (!found || found.orgId !== orgId) {
      return null;
    }
    return { id: found.id, phEnabled: found.phEnabled };
  }

  async ownershipShares(propertyId: string) {
    return this.shares.get(propertyId) ?? [];
  }

  async createAssemblyAct(
    propertyId: string,
    data: {
      heldAt: Date;
      attendance: { ownerId: string; sharePct: number; proxyTo?: string | null }[];
      quorumMet: boolean;
    },
  ) {
    const row = {
      id: `act-${this.acts.length + 1}`,
      orgId: "org-a",
      propertyId,
      ...data,
    };
    this.acts.push(row);
    const { orgId: _o, ...rest } = row;
    return rest;
  }

  async listAssemblyActs(propertyId: string) {
    return this.acts
      .filter((row) => row.propertyId === propertyId)
      .map(({ orgId: _o, ...rest }) => rest);
  }

  async findAssemblyAct(id: string) {
    const found = this.acts.find((row) => row.id === id);
    if (!found) {
      return null;
    }
    const { orgId, ...rest } = found;
    return { ...rest, orgId };
  }

  async createDecision(
    assemblyActId: string,
    data: { title: string; description: string | null; majority: "ORDINARY" | "QUALIFIED" },
  ) {
    const row = { id: `dec-${this.decisions.length + 1}`, assemblyActId, ...data };
    this.decisions.push(row);
    return row;
  }

  async listDecisions(assemblyActId: string) {
    return this.decisions.filter((row) => row.assemblyActId === assemblyActId);
  }

  async recordVote(
    decisionId: string,
    data: { ownerId: string | null; weight: number; choice: "APPROVE" | "REJECT" | "ABSTAIN" },
  ) {
    const row = { id: `vote-${this.votes.length + 1}`, decisionId, ...data };
    this.votes.push(row);
    return row;
  }

  async listVotes(decisionId: string) {
    return this.votes.filter((row) => row.decisionId === decisionId);
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const authStore = new FakeAuthStore();
const governanceStore = new FakeGovernanceStore();

@Module({
  controllers: [AuthController, GovernanceController],
  providers: [
    AuthService,
    GovernanceService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: GOVERNANCE_STORE, useValue: governanceStore },
  ],
})
class GovernanceTestModule implements NestModule {
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
      permissions: ["property:read", "property:write"],
    },
  ]);
  app = await NestFactory.create(GovernanceTestModule, { logger: false });
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

describe("assembly acts and ownership-weighted voting", () => {
  test("quorum counts proxies without double counting", async () => {
    const act = (await (
      await fetch(`${baseUrl}/api/v1/assembly-acts`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          propertyId: "prop-1",
          heldAt: "2026-03-15T10:00:00Z",
          attendance: [
            { ownerId: "owner-a", sharePct: 70 },
            { ownerId: "owner-b", sharePct: 30, proxyTo: "owner-a" },
          ],
        }),
      })
    ).json()) as { id: string; presentPct: number; quorumMet: boolean };
    expect(act.presentPct).toBe(100);
    expect(act.quorumMet).toBe(true);
    const outsider = await fetch(`${baseUrl}/api/v1/assembly-acts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        propertyId: "prop-1",
        heldAt: "2026-03-15T10:00:00Z",
        attendance: [{ ownerId: "owner-unknown", sharePct: 10 }],
      }),
    });
    expect(outsider.status).toBe(400);
    const listed = (await (
      await fetch(`${baseUrl}/api/v1/assembly-acts?propertyId=prop-1`, { headers: headers() })
    ).json()) as { id: string }[];
    expect(listed.map((row) => row.id)).toContain(act.id);
    expect(governanceStore.audits).toContain("assembly.act_recorded");
  });

  test("ordinary and qualified majorities decide by ownership weight", async () => {
    const acts = (await (
      await fetch(`${baseUrl}/api/v1/assembly-acts?propertyId=prop-1`, { headers: headers() })
    ).json()) as { id: string }[];
    const actId = acts[0]?.id ?? "";
    const ordinary = (await (
      await fetch(`${baseUrl}/api/v1/assembly-acts/${actId}/decisions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title: "Pintar fachada", majority: "ORDINARY" }),
      })
    ).json()) as { id: string };
    await fetch(`${baseUrl}/api/v1/assembly-acts/${actId}/decisions/${ordinary.id}/votes`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ownerId: "owner-a", weight: 70, choice: "APPROVE" }),
    });
    await fetch(`${baseUrl}/api/v1/assembly-acts/${actId}/decisions/${ordinary.id}/votes`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ownerId: "owner-b", weight: 30, choice: "REJECT" }),
    });
    const ordinaryResult = (await (
      await fetch(`${baseUrl}/api/v1/assembly-acts/${actId}/decisions/${ordinary.id}/result`, {
        headers: headers(),
      })
    ).json()) as { approved: boolean; approveWeight: number };
    expect(ordinaryResult.approved).toBe(true);
    expect(ordinaryResult.approveWeight).toBe(70);
    const qualified = (await (
      await fetch(`${baseUrl}/api/v1/assembly-acts/${actId}/decisions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title: "Cuota extraordinaria", majority: "QUALIFIED" }),
      })
    ).json()) as { id: string };
    await fetch(`${baseUrl}/api/v1/assembly-acts/${actId}/decisions/${qualified.id}/votes`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ownerId: "owner-b", weight: 30, choice: "APPROVE" }),
    });
    const qualifiedResult = (await (
      await fetch(`${baseUrl}/api/v1/assembly-acts/${actId}/decisions/${qualified.id}/result`, {
        headers: headers(),
      })
    ).json()) as { approved: boolean };
    expect(qualifiedResult.approved).toBe(false);
    const overweight = await fetch(
      `${baseUrl}/api/v1/assembly-acts/${actId}/decisions/${qualified.id}/votes`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ownerId: "owner-b", weight: 50, choice: "APPROVE" }),
      },
    );
    expect(overweight.status).toBe(400);
    expect(governanceStore.audits).toContain("assembly.vote_recorded");
  });
});
