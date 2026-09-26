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
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { ReportsController } from "../src/reports/reports.controller";
import { ReportsService } from "../src/reports/reports.service";
import type { ReportsStore } from "../src/reports/store";
import { REPORTS_STORE } from "../src/reports/tokens";
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

class FakeReportsStore implements ReportsStore {
  async listPropertiesWithUnits() {
    return [{ id: "prop-1", unitIds: ["u1", "u2"] }];
  }

  async tenanciesOverlapping() {
    return [{ propertyId: "prop-1", unitId: "u1" }];
  }

  async contractsEnding() {
    return [{ id: "c1", number: "C-1", endDate: new Date("2026-04-15") }];
  }

  async chargesDue() {
    return [
      {
        amountMinor: 180000000,
        balanceMinor: 180000000,
        dueDate: new Date("2026-01-05"),
      },
      { amountMinor: 180000000, balanceMinor: 0, dueDate: new Date("2026-02-05") },
    ];
  }

  async settlementsForPeriod() {
    return [
      {
        propertyId: "prop-1",
        collectedMinor: 180000000,
        commissionMinor: 0,
        deductionsMinor: 0,
        netMinor: 180000000,
        currency: "COP",
      },
    ];
  }

  async maintenanceCases() {
    return [
      {
        propertyId: "prop-1",
        status: "RESOLVED",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-03"),
      },
      {
        propertyId: "prop-1",
        status: "OPEN",
        createdAt: new Date("2026-02-01"),
        updatedAt: new Date("2026-02-01"),
      },
    ];
  }
}

const authStore = new FakeAuthStore();

@Module({
  controllers: [AuthController, ReportsController],
  providers: [
    AuthService,
    ReportsService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: REPORTS_STORE, useValue: new FakeReportsStore() },
  ],
})
class ReportsTestModule implements NestModule {
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
      permissions: ["finance:read"],
    },
  ]);
  app = await NestFactory.create(ReportsTestModule, { logger: false });
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

describe("v1 KPI set", () => {
  test("returns occupancy, delinquency, expirations, SLA and per-property P&L", async () => {
    const response = await fetch(`${baseUrl}/api/v1/kpis?period=2026-02`, {
      headers: headers(),
    });
    expect(response.status).toBe(200);
    const kpis = (await response.json()) as {
      period: string;
      occupancy: number;
      occupiedUnits: number;
      totalUnits: number;
      delinquencyRate: number;
      overdueMinor: number;
      totalBilledMinor: number;
      upcomingExpirations: { id: string; daysRemaining: number }[];
      maintenanceSla: { rate: number; resolved: number; openCases: number };
      perPropertyPnl: {
        propertyId: string;
        collectedMinor: number;
        commissionMinor: number;
        deductionsMinor: number;
        netMinor: number;
        currency: string;
      }[];
    };
    expect(kpis.period).toBe("2026-02");
    expect(kpis.occupancy).toBe(0.5);
    expect(kpis.delinquencyRate).toBe(0.5);
    expect(kpis.overdueMinor).toBe(180000000);
    expect(kpis.totalBilledMinor).toBe(360000000);
    expect(kpis.upcomingExpirations.map((entry) => entry.id)).toContain("c1");
    expect(kpis.maintenanceSla.rate).toBe(1);
    expect(kpis.maintenanceSla.openCases).toBe(1);
    expect(kpis.perPropertyPnl).toEqual([
      {
        propertyId: "prop-1",
        collectedMinor: 180000000,
        commissionMinor: 0,
        deductionsMinor: 0,
        netMinor: 180000000,
        currency: "COP",
      },
    ]);
  });

  test("rejects invalid periods", async () => {
    const bad = await fetch(`${baseUrl}/api/v1/kpis?period=febrero`, { headers: headers() });
    expect(bad.status).toBe(400);
    const missing = await fetch(`${baseUrl}/api/v1/kpis`, { headers: headers() });
    expect(missing.status).toBe(403);
  });
});
