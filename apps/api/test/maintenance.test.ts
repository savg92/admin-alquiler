import "reflect-metadata";
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";
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
import { DirectoryController } from "../src/operations/directory.controller";
import { DirectoryService } from "../src/operations/directory.service";
import { CasesController } from "../src/operations/cases.controller";
import { CasesService } from "../src/operations/cases.service";
import { MaintenanceController } from "../src/operations/maintenance.controller";
import { MaintenanceService } from "../src/operations/maintenance.service";
import type { OperationsStore } from "../src/operations/store";
import { OPERATIONS_STORE } from "../src/operations/tokens";
import { RentalService } from "../src/rental/rental.service";
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

  async assignWorkOrderSupplier(id: string, supplierId: string) {
    const found = this.orders.find((row) => row.id === id);
    if (!found) {
      throw new Error("Work order not found.");
    }
    found.supplierId = supplierId;
    return found;
  }

  suppliers: {
    id: string;
    orgId: string;
    name: string;
    category: string;
    contact: string | null;
    taxId: string | null;
    address: string | null;
    notes: string | null;
  }[] = [];

  async createSupplier(
    orgId: string,
    data: {
      name: string;
      category: string;
      contact: string | null;
      taxId: string | null;
      address: string | null;
      notes: string | null;
    },
  ) {
    const row = { id: `sup-${this.suppliers.length + 1}`, orgId, ...data };
    this.suppliers.push(row);
    const { orgId: _o, ...rest } = row;
    return rest;
  }

  async listSuppliers(orgId: string) {
    return this.suppliers
      .filter((row) => row.orgId === orgId)
      .map(({ orgId: _o, ...rest }) => rest);
  }

  async findSupplier(id: string, orgId: string) {
    const found = this.suppliers.find((row) => row.id === id && row.orgId === orgId);
    if (!found) {
      return null;
    }
    const { orgId: _o, ...rest } = found;
    return rest;
  }

  purchases: {
    id: string;
    orgId: string;
    propertyId: string;
    supplierId: string | null;
    place: string | null;
    description: string;
    amountMinor: number;
    currency: string;
    date: Date;
    receiptRef: string | null;
    recordedBy: string;
  }[] = [];

  async createPurchase(
    orgId: string,
    data: {
      propertyId: string;
      supplierId: string | null;
      place: string | null;
      description: string;
      amountMinor: number;
      currency: string;
      date: Date;
      receiptRef: string | null;
      recordedBy: string;
    },
  ) {
    const row = { id: `pur-${this.purchases.length + 1}`, orgId, ...data };
    this.purchases.push(row);
    const { orgId: _o, recordedBy: _b, ...rest } = row;
    return rest;
  }

  async listPurchases(orgId: string, propertyId?: string) {
    return this.purchases
      .filter(
        (row) => row.orgId === orgId && (propertyId === undefined || row.propertyId === propertyId),
      )
      .map(({ orgId: _o, recordedBy: _b, ...rest }) => rest);
  }

  insurance: {
    id: string;
    orgId: string;
    propertyId: string | null;
    contractId: string | null;
    provider: string;
    policyRef: string;
    validFrom: Date;
    validUntil: Date;
  }[] = [];

  async createInsurance(
    orgId: string,
    data: {
      propertyId: string | null;
      contractId: string | null;
      provider: string;
      policyRef: string;
      validFrom: Date;
      validUntil: Date;
    },
  ) {
    const row = { id: `ins-${this.insurance.length + 1}`, orgId, ...data };
    this.insurance.push(row);
    const { orgId: _o, ...rest } = row;
    return rest;
  }

  async listInsurance(orgId: string, propertyId?: string) {
    return this.insurance
      .filter(
        (row) => row.orgId === orgId && (propertyId === undefined || row.propertyId === propertyId),
      )
      .map(({ orgId: _o, ...rest }) => rest);
  }

  complaints: {
    id: string;
    orgId: string;
    propertyId: string;
    reporter: string;
    subject: string;
    body: string;
    status: string;
  }[] = [];

  async createComplaint(
    orgId: string,
    data: { propertyId: string; reporter: string; subject: string; body: string },
  ) {
    const row = { id: `com-${this.complaints.length + 1}`, orgId, status: "open", ...data };
    this.complaints.push(row);
    const { orgId: _o, ...rest } = row;
    return rest;
  }

  async listComplaints(orgId: string, propertyId?: string) {
    return this.complaints
      .filter(
        (row) => row.orgId === orgId && (propertyId === undefined || row.propertyId === propertyId),
      )
      .map(({ orgId: _o, ...rest }) => rest);
  }

  async findComplaint(id: string, orgId: string) {
    const found = this.complaints.find((row) => row.id === id && row.orgId === orgId);
    if (!found) {
      return null;
    }
    const { orgId: _o, ...rest } = found;
    return rest;
  }

  async setComplaintStatus(id: string, status: string) {
    const found = this.complaints.find((row) => row.id === id);
    if (!found) {
      throw new Error("Complaint not found.");
    }
    found.status = status;
    const { orgId: _o, ...rest } = found;
    return rest;
  }

  claims: {
    id: string;
    orgId: string;
    propertyId: string;
    subject: string;
    body: string;
    status: string;
  }[] = [];

  async createClaim(orgId: string, data: { propertyId: string; subject: string; body: string }) {
    const row = { id: `clm-${this.claims.length + 1}`, orgId, status: "open", ...data };
    this.claims.push(row);
    const { orgId: _o, ...rest } = row;
    return { ...rest, reporter: "" };
  }

  async listClaims(orgId: string, propertyId?: string) {
    return this.claims
      .filter(
        (row) => row.orgId === orgId && (propertyId === undefined || row.propertyId === propertyId),
      )
      .map(({ orgId: _o, ...rest }) => ({ ...rest, reporter: "" }));
  }

  async findClaim(id: string, orgId: string) {
    const found = this.claims.find((row) => row.id === id && row.orgId === orgId);
    if (!found) {
      return null;
    }
    const { orgId: _o, ...rest } = found;
    return { ...rest, reporter: "" };
  }

  async setClaimStatus(id: string, status: string) {
    const found = this.claims.find((row) => row.id === id);
    if (!found) {
      throw new Error("Claim not found.");
    }
    found.status = status;
    const { orgId: _o, ...rest } = found;
    return { ...rest, reporter: "" };
  }

  taxes: {
    id: string;
    orgId: string;
    country: string;
    label: string;
    dueDate: Date;
    receiptRef: string | null;
  }[] = [];

  async createTaxRecord(
    orgId: string,
    data: { country: string; label: string; dueDate: Date; receiptRef: string | null },
  ) {
    const row = { id: `tax-${this.taxes.length + 1}`, orgId, ...data };
    this.taxes.push(row);
    const { orgId: _o, ...rest } = row;
    return rest;
  }

  async listTaxRecords(orgId: string, before?: Date) {
    return this.taxes
      .filter((row) => row.orgId === orgId && (before === undefined || row.dueDate <= before))
      .map(({ orgId: _o, ...rest }) => rest);
  }

  houseRules: { id: string; propertyId: string; version: number; body: string }[] = [];

  async createHouseRule(propertyId: string, body: string) {
    const version =
      Math.max(
        0,
        ...this.houseRules.filter((row) => row.propertyId === propertyId).map((row) => row.version),
      ) + 1;
    const row = { id: `hr-${this.houseRules.length + 1}`, propertyId, version, body };
    this.houseRules.push(row);
    return row;
  }

  async listHouseRules(propertyId: string) {
    return this.houseRules
      .filter((row) => row.propertyId === propertyId)
      .sort((a, b) => a.version - b.version);
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const authStore = new FakeAuthStore();
const operationsStore = new FakeOperationsStore();

@Module({
  controllers: [AuthController, CasesController, DirectoryController, MaintenanceController],
  providers: [
    AuthService,
    CasesService,
    DirectoryService,
    MaintenanceService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: OPERATIONS_STORE, useValue: operationsStore },
    {
      provide: RentalService,
      useValue: {
        getContract: async () => {
          throw new NotFoundException("Contract not found.");
        },
      },
    },
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
      permissions: ["maintenance:read", "maintenance:write", "property:read", "property:write"],
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

describe("suppliers, purchases and insurance", () => {
  test("supplier directory has no accounts, purchases track place per property", async () => {
    const supplier = (await (
      await fetch(`${baseUrl}/api/v1/suppliers`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: "Ferretería El Tornillo",
          category: "store",
          address: "Calle 10 #5-20",
        }),
      })
    ).json()) as { id: string; category: string };
    expect(supplier.category).toBe("store");
    const listed = (await (
      await fetch(`${baseUrl}/api/v1/suppliers`, { headers: headers() })
    ).json()) as { id: string }[];
    expect(listed.map((row) => row.id)).toContain(supplier.id);
    const purchase = (await (
      await fetch(`${baseUrl}/api/v1/purchases`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          propertyId: "prop-1",
          supplierId: supplier.id,
          place: "Ferretería El Tornillo - sede norte",
          description: "Tubería PVC 1/2",
          amount: 85000,
          currency: "COP",
          date: "2026-02-10",
          receiptRef: "FAC-001",
        }),
      })
    ).json()) as { amountMinor: number; place: string; supplierId: string };
    expect(purchase.amountMinor).toBe(8500000);
    expect(purchase.place).toContain("sede norte");
    const badSupplier = await fetch(`${baseUrl}/api/v1/purchases`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        propertyId: "prop-1",
        supplierId: "sup-unknown",
        description: "X",
        amount: 1000,
        currency: "COP",
        date: "2026-02-10",
      }),
    });
    expect(badSupplier.status).toBe(404);
    const perProperty = (await (
      await fetch(`${baseUrl}/api/v1/purchases?propertyId=prop-1`, { headers: headers() })
    ).json()) as { id: string }[];
    expect(perProperty).toHaveLength(1);
    expect(operationsStore.audits).toContain("purchase.recorded");
  });

  test("insurance records link property and contract policies", async () => {
    const record = (await (
      await fetch(`${baseUrl}/api/v1/insurance`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          propertyId: "prop-1",
          provider: "Sura",
          policyRef: "POL-123",
          validFrom: "2026-01-01",
          validUntil: "2026-12-31",
        }),
      })
    ).json()) as { id: string; policyRef: string };
    expect(record.policyRef).toBe("POL-123");
    const badDates = await fetch(`${baseUrl}/api/v1/insurance`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        provider: "Sura",
        policyRef: "POL-124",
        validFrom: "2026-12-31",
        validUntil: "2026-01-01",
      }),
    });
    expect(badDates.status).toBe(400);
    const unknownContract = await fetch(`${baseUrl}/api/v1/insurance`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        contractId: "contract-unknown",
        provider: "Sura",
        policyRef: "POL-125",
        validFrom: "2026-01-01",
        validUntil: "2026-12-31",
      }),
    });
    expect(unknownContract.status).toBe(404);
    const listed = (await (
      await fetch(`${baseUrl}/api/v1/insurance?propertyId=prop-1`, { headers: headers() })
    ).json()) as { id: string }[];
    expect(listed.map((row) => row.id)).toContain(record.id);
  });

  test("work orders accept supplier assignment", async () => {
    const suppliers = (await (
      await fetch(`${baseUrl}/api/v1/suppliers`, { headers: headers() })
    ).json()) as { id: string }[];
    const supplierId = suppliers[0]?.id ?? "";
    const requests = (await (
      await fetch(`${baseUrl}/api/v1/maintenance-requests`, { headers: headers() })
    ).json()) as { id: string }[];
    const requestId = requests[0]?.id ?? "";
    const assigned = (await (
      await fetch(`${baseUrl}/api/v1/maintenance-requests/${requestId}/work-orders/wo-1/assign`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ supplierId }),
      })
    ).json()) as { supplierId: string };
    expect(assigned.supplierId).toBe(supplierId);
    expect(operationsStore.audits).toContain("maintenance.work_order_assigned");
  });
});

describe("complaints, claims, tax and house rules", () => {
  test("complaints and claims follow configurable workflows", async () => {
    const complaint = (await (
      await fetch(`${baseUrl}/api/v1/complaints`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          propertyId: "prop-1",
          reporter: "Tenant 101",
          subject: "Ruido nocturno",
          body: "Música alta después de las 10pm.",
        }),
      })
    ).json()) as { id: string; status: string };
    expect(complaint.status).toBe("open");
    const badJump = await fetch(`${baseUrl}/api/v1/complaints/${complaint.id}/transitions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ to: "resolved" }),
    });
    expect(badJump.status).toBe(400);
    for (const to of ["in_progress", "resolved", "closed"]) {
      const step = await fetch(`${baseUrl}/api/v1/complaints/${complaint.id}/transitions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ to }),
      });
      expect(step.status).toBe(201);
    }
    const claim = (await (
      await fetch(`${baseUrl}/api/v1/claims`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          propertyId: "prop-1",
          subject: "Reclamo administración",
          body: "Cobro duplicado de cuota.",
        }),
      })
    ).json()) as { id: string; status: string };
    expect(claim.status).toBe("open");
    const listed = (await (
      await fetch(`${baseUrl}/api/v1/claims?propertyId=prop-1`, { headers: headers() })
    ).json()) as { id: string }[];
    expect(listed.map((row) => row.id)).toContain(claim.id);
    expect(operationsStore.audits).toContain("complaint.created");
    expect(operationsStore.audits).toContain("claim.created");
  });

  test("tax records are record-only with deadline reminders", async () => {
    const record = (await (
      await fetch(`${baseUrl}/api/v1/tax-records`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ country: "co", label: "Predial 2026", dueDate: "2026-06-30" }),
      })
    ).json()) as { id: string; country: string };
    expect(record.country).toBe("CO");
    const deadlines = (await (
      await fetch(`${baseUrl}/api/v1/tax-deadlines?withinDays=365`, { headers: headers() })
    ).json()) as { id: string; daysRemaining: number }[];
    expect(deadlines.map((row) => row.id)).toContain(record.id);
    expect(operationsStore.audits).toContain("tax.recorded");
  });

  test("house rules are versioned per property", async () => {
    const first = (await (
      await fetch(`${baseUrl}/api/v1/properties/prop-1/house-rules`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ body: "Silencio después de las 10pm." }),
      })
    ).json()) as { version: number };
    expect(first.version).toBe(1);
    const second = (await (
      await fetch(`${baseUrl}/api/v1/properties/prop-1/house-rules`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ body: "Silencio después de las 10pm. Mascotas con correa." }),
      })
    ).json()) as { version: number };
    expect(second.version).toBe(2);
    const listed = (await (
      await fetch(`${baseUrl}/api/v1/properties/prop-1/house-rules`, { headers: headers() })
    ).json()) as { version: number }[];
    expect(listed.map((row) => row.version)).toEqual([1, 2]);
    expect(operationsStore.audits).toContain("house_rule.published");
  });
});
