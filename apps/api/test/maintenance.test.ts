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
import { MaintenanceController } from "../src/operations/maintenance.controller";
import { MaintenanceService } from "../src/operations/maintenance.service";
import type { OperationsStore } from "../src/operations/store";
import { OPERATIONS_STORE } from "../src/operations/tokens";
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

class FakeOperationsStore implements OperationsStore {
  properties = new Map<string, { id: string; orgId: string }>([
    ["prop-1", { id: "prop-1", orgId: "org-a" }],
  ]);
  units = new Map<string, { id: string; propertyId: string }>([
    ["unit-1", { id: "unit-1", propertyId: "prop-1" }],
  ]);
  requests: {
    id: string;
    orgId: string;
    propertyId: string;
    unitId: string | null;
    title: string;
    description: string;
    priority: string;
    status: string;
  }[] = [];
  orders: {
    id: string;
    requestId: string;
    supplierId: string | null;
    status: string;
    costMinor: number | null;
    currency: string | null;
  }[] = [];
  audits: string[] = [];

  async findProperty(id: string, orgId: string) {
    const found = this.properties.get(id);
    return found && found.orgId === orgId ? { id: found.id } : null;
  }

  async findUnit(unitId: string) {
    return this.units.get(unitId) ?? null;
  }

  async createMaintenanceRequest(
    orgId: string,
    data: {
      propertyId: string;
      unitId: string | null;
      title: string;
      description: string;
      priority: string;
    },
  ) {
    const row = { id: `mr-${this.requests.length + 1}`, orgId, status: "OPEN", ...data };
    this.requests.push(row);
    const { orgId: _o, ...rest } = row;
    return rest;
  }

  async listMaintenanceRequests(orgId: string, propertyId?: string) {
    return this.requests
      .filter(
        (row) => row.orgId === orgId && (propertyId === undefined || row.propertyId === propertyId),
      )
      .map(({ orgId: _o, ...rest }) => rest);
  }

  async findMaintenanceRequest(id: string, orgId: string) {
    const found = this.requests.find((row) => row.id === id && row.orgId === orgId);
    if (!found) {
      return null;
    }
    const { orgId: _o, ...rest } = found;
    return rest;
  }

  async setMaintenanceStatus(id: string, status: string) {
    const found = this.requests.find((row) => row.id === id);
    if (!found) {
      throw new Error("Request not found.");
    }
    found.status = status;
    const { orgId: _o, ...rest } = found;
    return rest;
  }

  async createWorkOrder(
    requestId: string,
    data: { supplierId: string | null; costMinor: number | null; currency: string | null },
  ) {
    const row = { id: `wo-${this.orders.length + 1}`, requestId, status: "OPEN", ...data };
    this.orders.push(row);
    return row;
  }

  async listWorkOrders(requestId: string) {
    return this.orders.filter((row) => row.requestId === requestId);
  }

  async setWorkOrderStatus(
    id: string,
    data: { status?: string; costMinor?: number | null; currency?: string | null },
  ) {
    const found = this.orders.find((row) => row.id === id);
    if (!found) {
      throw new Error("Work order not found.");
    }
    if (data.status !== undefined) {
      found.status = data.status;
    }
    if (data.costMinor !== undefined) {
      found.costMinor = data.costMinor;
    }
    if (data.currency !== undefined) {
      found.currency = data.currency;
    }
    return found;
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const authStore = new FakeAuthStore();
const operationsStore = new FakeOperationsStore();

@Module({
  controllers: [AuthController, MaintenanceController],
  providers: [
    AuthService,
    MaintenanceService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: OPERATIONS_STORE, useValue: operationsStore },
  ],
})
class MaintenanceTestModule implements NestModule {
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
      permissions: ["maintenance:read", "maintenance:write"],
    },
  ]);
  app = await NestFactory.create(MaintenanceTestModule, { logger: false });
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

describe("maintenance and work orders", () => {
  test("creates requests scoped to property/unit with priority", async () => {
    const created = (await (
      await fetch(`${baseUrl}/api/v1/maintenance-requests`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          propertyId: "prop-1",
          unitId: "unit-1",
          title: "Fuga en cocina",
          description: "Goteo bajo el lavaplatos.",
          priority: "HIGH",
        }),
      })
    ).json()) as { id: string; status: string; priority: string };
    expect(created.status).toBe("OPEN");
    expect(created.priority).toBe("HIGH");
    const badUnit = await fetch(`${baseUrl}/api/v1/maintenance-requests`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        propertyId: "prop-1",
        unitId: "unit-unknown",
        title: "X",
        description: "Y",
      }),
    });
    expect(badUnit.status).toBe(404);
    const badPriority = await fetch(`${baseUrl}/api/v1/maintenance-requests`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        propertyId: "prop-1",
        title: "X",
        description: "Y",
        priority: "CRITICAL",
      }),
    });
    expect(badPriority.status).toBe(400);
    const listed = (await (
      await fetch(`${baseUrl}/api/v1/maintenance-requests?propertyId=prop-1`, {
        headers: headers(),
      })
    ).json()) as { id: string }[];
    expect(listed.map((row) => row.id)).toContain(created.id);
    expect(operationsStore.audits).toContain("maintenance.request_created");
  });

  test("status transitions and work orders with costs", async () => {
    const requests = (await (
      await fetch(`${baseUrl}/api/v1/maintenance-requests`, { headers: headers() })
    ).json()) as { id: string }[];
    const requestId = requests[0]?.id ?? "";
    const badJump = await fetch(`${baseUrl}/api/v1/maintenance-requests/${requestId}/transitions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ to: "RESOLVED" }),
    });
    expect(badJump.status).toBe(400);
    for (const to of ["IN_PROGRESS", "RESOLVED", "CLOSED"]) {
      const step = await fetch(`${baseUrl}/api/v1/maintenance-requests/${requestId}/transitions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ to }),
      });
      expect(step.status).toBe(201);
    }
    const order = (await (
      await fetch(`${baseUrl}/api/v1/maintenance-requests/${requestId}/work-orders`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ cost: 250000, currency: "COP" }),
      })
    ).json()) as { id: string; costMinor: number; currency: string };
    expect(order.costMinor).toBe(25000000);
    expect(order.currency).toBe("COP");
    const orders = (await (
      await fetch(`${baseUrl}/api/v1/maintenance-requests/${requestId}/work-orders`, {
        headers: headers(),
      })
    ).json()) as { id: string }[];
    expect(orders.map((row) => row.id)).toContain(order.id);
    const moved = await fetch(
      `${baseUrl}/api/v1/maintenance-requests/${requestId}/work-orders/${order.id}/transitions`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ to: "IN_PROGRESS" }),
      },
    );
    expect(moved.status).toBe(201);
    expect(operationsStore.audits).toContain("maintenance.work_order_created");
  });
});
