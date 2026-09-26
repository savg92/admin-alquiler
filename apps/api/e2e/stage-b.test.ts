import "reflect-metadata";
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import type { TenancyPeriod } from "@admin-alquiler/domain";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { RequestIdMiddleware } from "../src/request-id.middleware";
import { OrganizationsController } from "../src/organizations/organizations.controller";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { ORGS_STORE } from "../src/organizations/tokens";
import { PropertiesController } from "../src/properties/properties.controller";
import { PropertiesService } from "../src/properties/properties.service";
import type { PropertiesStore, PropertyDetail } from "../src/properties/store";
import { PROPERTIES_STORE } from "../src/properties/tokens";
import { RentalController } from "../src/rental/rental.controller";
import { RentalService } from "../src/rental/rental.service";
import type { ChargeRow, ContractRow, RentalStore } from "../src/rental/store";
import { RENTAL_STORE } from "../src/rental/tokens";
import { SettlementsController } from "../src/settlements/settlements.controller";
import { SettlementsService } from "../src/settlements/settlements.service";
import type { SettlementDetail } from "../src/settlements/store";
import { SETTLEMENTS_STORE } from "../src/settlements/tokens";

const TEST_SECRET = "test-secret-with-at-least-32-characters!!";
const BASELINE_PERMISSIONS = [
  "property:read",
  "property:write",
  "contract:read",
  "contract:write",
  "payment:read",
  "payment:write",
  "settlement:read",
  "settlement:write",
];

interface WorldProperty extends PropertyDetail {
  tenancies: { unitId: string | null; startDate: string; endDate: string | null }[];
  shares: { ownerId: string; sharePct: number }[];
}

interface WorldCharge extends ChargeRow {
  allocatedMinor: number;
}

class FakeWorld implements AuthStore, PropertiesStore, RentalStore {
  users = new Map<string, UserRow>();
  sessions = new Map<string, SessionRow>();
  memberships = new Map<string, MembershipRow[]>();
  orgs = new Map<string, { id: string; slug: string; currency: string; locale: string }>();
  roles = new Map<string, { id: string; name: string }>();
  properties = new Map<string, WorldProperty>();
  owners = new Map<string, { id: string }>();
  tenants = new Map<string, { id: string }>();
  contracts = new Map<string, ContractRow>();
  charges = new Map<string, WorldCharge>();
  payments = new Map<
    string,
    { id: string; contractId: string; amountMinor: number; paidAt: Date }
  >();
  receipts = new Map<string, { id: string; number: string; locale: string; paymentId: string }>();
  settlements = new Map<string, SettlementDetail>();
  attachments = new Map<
    string,
    {
      id: string;
      orgId: string;
      propertyId: string;
      unitId: string | null;
      kind: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      capturedAt: Date | null;
      createdBy: string;
    }
  >();
  numbers = new Set<string>();
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

  async touchSession(): Promise<void> {}

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async listMemberships(userId: string): Promise<MembershipRow[]> {
    return this.memberships.get(userId) ?? [];
  }

  async findOrgBySlug(slug: string): Promise<{ id: string } | null> {
    for (const org of this.orgs.values()) {
      if (org.slug === slug) {
        return { id: org.id };
      }
    }
    return null;
  }

  async createOrg(data: {
    slug: string;
    name: string;
    country: string;
    locale: string;
    currency: string;
    timezone: string;
  }): Promise<{
    id: string;
    slug: string;
    name: string;
    country: string;
    locale: string;
    currency: string;
    timezone: string;
  }> {
    const id = `org-${this.orgs.size + 1}`;
    const org = { id, ...data };
    this.orgs.set(id, org);
    return org;
  }

  async ensureAdminRole(orgId: string): Promise<{ id: string; name: string }> {
    const id = `role-${orgId}`;
    const role = { id, name: "admin" };
    this.roles.set(id, role);
    return role;
  }

  async findOrgById(id: string): Promise<{ id: string } | null> {
    return this.orgs.get(id) ?? null;
  }

  async listMembers(
    orgId: string,
  ): Promise<{ userId: string; orgId: string; status: "ACTIVE"; roleName: string }[]> {
    const rows: { userId: string; orgId: string; status: "ACTIVE"; roleName: string }[] = [];
    for (const [userId, memberships] of this.memberships.entries()) {
      for (const membership of memberships) {
        if (membership.orgId === orgId) {
          rows.push({ userId, orgId, status: "ACTIVE", roleName: membership.roleName });
        }
      }
    }
    return rows;
  }

  async findMembership(
    orgId: string,
    userId: string,
  ): Promise<{ userId: string; orgId: string; status: "ACTIVE"; roleName: string } | null> {
    const membership = (this.memberships.get(userId) ?? []).find((entry) => entry.orgId === orgId);
    if (!membership) {
      return null;
    }
    return { userId, orgId, status: "ACTIVE", roleName: membership.roleName };
  }

  async findRoleByName(orgId: string, name: string): Promise<{ id: string; name: string } | null> {
    for (const role of this.roles.values()) {
      if (role.name === name) {
        return role;
      }
    }
    if (name === "admin") {
      return this.ensureAdminRole(orgId);
    }
    return null;
  }

  async updateMembership(
    orgId: string,
    userId: string,
    data: { roleId?: string; status?: "ACTIVE" | "SUSPENDED" | "REVOKED" },
  ): Promise<{ userId: string; orgId: string; status: "ACTIVE"; roleName: string }> {
    const list = this.memberships.get(userId) ?? [];
    const entry = list.find((item) => item.orgId === orgId);
    if (!entry) {
      throw new Error("Membership not found.");
    }
    if (data.roleId !== undefined) {
      entry.roleName = this.roles.get(data.roleId)?.name ?? entry.roleName;
    }
    return { userId, orgId, status: "ACTIVE", roleName: entry.roleName };
  }

  async createMembership(userId: string, orgId: string, roleId: string): Promise<void> {
    const role = this.roles.get(roleId);
    const list = this.memberships.get(userId) ?? [];
    list.push({
      orgId,
      status: "ACTIVE",
      roleName: role?.name ?? "admin",
      permissions: [...BASELINE_PERMISSIONS],
    });
    this.memberships.set(userId, list);
  }

  async findOrgDefaults(): Promise<{ country: string; locale: string; currency: string }> {
    return { country: "CO", locale: "es-CO", currency: "COP" };
  }

  async findOrgProfile(): Promise<{ currency: string; locale: string }> {
    return { currency: "COP", locale: "es-CO" };
  }

  async findOrgCurrency(): Promise<string | null> {
    return "COP";
  }

  async createProperty(
    orgId: string,
    input: {
      name: string;
      address: string;
      city: string;
      phEnabled: boolean;
      units: { code: string; subtype: string }[];
    },
  ): Promise<PropertyDetail> {
    const id = `prop-${this.properties.size + 1}`;
    const detail: WorldProperty = {
      id,
      orgId,
      name: input.name,
      address: input.address,
      city: input.city,
      country: "CO",
      phEnabled: input.phEnabled,
      units: input.units.map((unit, index) => ({
        id: `unit-${id}-${index + 1}`,
        code: unit.code.trim(),
        subtype: unit.subtype,
      })),
      tenancies: [],
      shares: [],
    };
    this.properties.set(id, detail);
    const { tenancies: _t, shares: _s, ...rest } = detail;
    return rest;
  }

  async listProperties(orgId: string): Promise<
    {
      id: string;
      orgId: string;
      name: string;
      address: string;
      city: string;
      country: string;
      phEnabled: boolean;
    }[]
  > {
    return [...this.properties.values()]
      .filter((property) => property.orgId === orgId)
      .map(({ tenancies: _t, shares: _s, units: _u, ...row }) => row);
  }

  async findProperty(id: string, orgId: string): Promise<PropertyDetail | null> {
    const found = this.properties.get(id);
    if (!found || found.orgId !== orgId) {
      return null;
    }
    const { tenancies: _t, shares: _s, ...rest } = found;
    return rest;
  }

  async updatePropertyConfig(
    id: string,
    orgId: string,
    config: Record<string, unknown>,
  ): Promise<PropertyDetail | null> {
    const found = this.properties.get(id);
    if (!found || found.orgId !== orgId) {
      return null;
    }
    found.config = config;
    const { tenancies: _t, shares: _s, ...rest } = found;
    return rest;
  }

  async updateUnitConfig(
    unitId: string,
    orgId: string,
    config: Record<string, unknown>,
  ): Promise<{ id: string; code: string; subtype: string } | null> {
    for (const property of this.properties.values()) {
      if (property.orgId !== orgId) {
        continue;
      }
      const unit = property.units.find((entry) => entry.id === unitId);
      if (unit) {
        unit.config = config;
        return { id: unit.id, code: unit.code, subtype: unit.subtype };
      }
    }
    return null;
  }

  async listAttachments(propertyId: string, orgId: string) {
    const property = this.properties.get(propertyId);
    if (!property || property.orgId !== orgId) {
      return null;
    }
    return [...this.attachments.values()]
      .filter((row) => row.propertyId === propertyId)
      .map((row) => ({ ...row, capturedAt: row.capturedAt?.toISOString() ?? null }));
  }

  async createAttachment(data: {
    orgId: string;
    propertyId: string;
    unitId: string | null;
    kind: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    capturedAt: Date | null;
    createdBy: string;
  }) {
    const row = { id: `att-${this.attachments.size + 1}`, ...data };
    this.attachments.set(row.id, row);
    return { ...row, capturedAt: row.capturedAt?.toISOString() ?? null };
  }

  async deleteAttachment(id: string, orgId: string): Promise<boolean> {
    const found = this.attachments.get(id);
    if (!found || found.orgId !== orgId) {
      return false;
    }
    this.attachments.delete(id);
    return true;
  }

  async unitTenancyPeriods(unitId: string): Promise<TenancyPeriod[]> {
    const periods: TenancyPeriod[] = [];
    for (const property of this.properties.values()) {
      for (const tenancy of property.tenancies) {
        if (tenancy.unitId === unitId) {
          periods.push({ startDate: tenancy.startDate, endDate: tenancy.endDate });
        }
      }
    }
    return periods;
  }

  async ownershipTotalPct(propertyId: string): Promise<number> {
    const found = this.properties.get(propertyId);
    return found ? found.shares.reduce((total, share) => total + share.sharePct, 0) : 0;
  }

  async tenancyCount(propertyId: string): Promise<number> {
    return this.properties.get(propertyId)?.tenancies.length ?? 0;
  }

  async createOwner(): Promise<{ id: string }> {
    const id = `owner-${this.owners.size + 1}`;
    this.owners.set(id, { id });
    return { id };
  }

  async assignOwnership(data: {
    propertyId: string;
    ownerId: string;
    sharePct: number;
  }): Promise<void> {
    this.properties
      .get(data.propertyId)
      ?.shares.push({ ownerId: data.ownerId, sharePct: data.sharePct });
  }

  async createTenant(): Promise<{ id: string }> {
    const id = `tenant-${this.tenants.size + 1}`;
    this.tenants.set(id, { id });
    return { id };
  }

  async createTenancy(data: {
    propertyId: string;
    unitId: string | null;
    tenantId: string;
    startDate: Date;
    endDate: Date | null;
  }): Promise<{ id: string }> {
    this.properties.get(data.propertyId)?.tenancies.push({
      unitId: data.unitId,
      startDate: data.startDate.toISOString().slice(0, 10),
      endDate: data.endDate ? data.endDate.toISOString().slice(0, 10) : null,
    });
    return { id: `tenancy-${Date.now()}` };
  }

  async findTenant(tenantId: string): Promise<{ id: string } | null> {
    return this.tenants.has(tenantId) ? { id: tenantId } : null;
  }

  async isContractNumberTaken(_orgId: string, number: string): Promise<boolean> {
    return this.numbers.has(number);
  }

  async createContract(
    orgId: string,
    input: {
      propertyId: string;
      tenantId: string;
      number: string;
      startDate: string;
      endDate: string;
      rentAmountMinor: number;
      currency: string;
    },
  ): Promise<ContractRow> {
    const id = `contract-${this.contracts.size + 1}`;
    this.numbers.add(input.number);
    const row: ContractRow = {
      id,
      orgId,
      propertyId: input.propertyId,
      tenantId: input.tenantId,
      number: input.number,
      status: "ACTIVE",
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      rentAmountMinor: input.rentAmountMinor,
      currency: input.currency,
    };
    this.contracts.set(id, row);
    return row;
  }

  async listContracts(orgId: string): Promise<ContractRow[]> {
    return [...this.contracts.values()].filter((contract) => contract.orgId === orgId);
  }

  async findContract(id: string, orgId: string): Promise<ContractRow | null> {
    const found = this.contracts.get(id);
    return found && found.orgId === orgId ? found : null;
  }

  async findCharge(contractId: string, period: string, type: string) {
    for (const charge of this.charges.values()) {
      if (charge.contractId === contractId && charge.period === period && charge.type === type) {
        const { allocatedMinor: _a, ...rest } = charge;
        return rest;
      }
    }
    return null;
  }

  async createCharge(data: {
    orgId: string;
    contractId: string;
    type: string;
    description: string;
    amountMinor: number;
    currency: string;
    dueDate: Date;
    period: string;
  }) {
    const id = `charge-${this.charges.size + 1}`;
    const stored: WorldCharge = {
      id,
      contractId: data.contractId,
      type: data.type,
      description: data.description,
      amountMinor: data.amountMinor,
      currency: data.currency,
      dueDate: data.dueDate,
      period: data.period,
      status: "PENDING",
      allocatedMinor: 0,
    };
    this.charges.set(id, stored);
    const { allocatedMinor: _a, ...rest } = stored;
    return rest;
  }

  async pendingChargeBalances(contractId: string) {
    return [...this.charges.values()]
      .filter((charge) => charge.contractId === contractId && charge.status !== "PAID")
      .map((charge) => ({
        id: charge.id,
        balanceMinor: charge.amountMinor - charge.allocatedMinor,
        dueDate: charge.dueDate.toISOString().slice(0, 10),
      }));
  }

  async createPayment(data: {
    contractId: string;
    amountMinor: number;
    paidAt: Date;
  }): Promise<{ id: string }> {
    const id = `payment-${this.payments.size + 1}`;
    this.payments.set(id, {
      id,
      contractId: data.contractId,
      amountMinor: data.amountMinor,
      paidAt: data.paidAt,
    });
    return { id };
  }

  async createAllocation(_paymentId: string, chargeId: string, amountMinor: number): Promise<void> {
    const charge = this.charges.get(chargeId);
    if (charge) {
      charge.allocatedMinor += amountMinor;
    }
  }

  async updateChargeStatus(chargeId: string, status: string): Promise<void> {
    const charge = this.charges.get(chargeId);
    if (charge) {
      charge.status = status;
    }
  }

  async createReceipt(
    paymentId: string,
    number: string,
    locale: string,
  ): Promise<{ id: string; number: string; locale: string }> {
    const receipt = { id: `receipt-${paymentId}`, number, locale, paymentId };
    this.receipts.set(receipt.id, receipt);
    return receipt;
  }

  async findReceipt(
    id: string,
  ): Promise<{ id: string; number: string; locale: string; paymentId: string } | null> {
    return this.receipts.get(id) ?? null;
  }

  codeudores = new Map<
    string,
    {
      id: string;
      contractId: string;
      name: string;
      documentId: string | null;
      contact: string | null;
      validFrom: Date;
      validUntil: Date | null;
    }
  >();

  async createCodeudor(
    contractId: string,
    input: {
      name: string;
      documentId?: string | null;
      contact?: string | null;
      validFrom: string;
      validUntil?: string | null;
    },
  ) {
    const id = `codeudor-${this.codeudores.size + 1}`;
    const row = {
      id,
      contractId,
      name: input.name,
      documentId: input.documentId ?? null,
      contact: input.contact ?? null,
      validFrom: new Date(input.validFrom),
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
    };
    this.codeudores.set(id, row);
    return row;
  }

  async listCodeudores(contractId: string) {
    return [...this.codeudores.values()].filter((row) => row.contractId === contractId);
  }

  async expiringCodeudores() {
    const now = Date.now();
    return [...this.codeudores.values()]
      .filter((row) => row.validUntil && row.validUntil.getTime() >= now)
      .map((row) => ({ ...row, contractNumber: "C-E2E" }));
  }

  async expiringContracts(orgId: string) {
    return [...this.contracts.values()].filter((contract) => contract.orgId === orgId);
  }

  async renewContract(id: string, data: { endDate: Date; rentAmountMinor?: number }) {
    const found = this.contracts.get(id);
    if (!found) {
      throw new Error("Contract not found.");
    }
    found.endDate = data.endDate;
    if (data.rentAmountMinor !== undefined) {
      found.rentAmountMinor = data.rentAmountMinor;
    }
    return found;
  }

  terminations = new Map<
    string,
    {
      id: string;
      contractId: string;
      noticeDate: Date;
      effectiveDate: Date;
      cause: string;
      indemnityRef: string | null;
    }
  >();

  async getTermination(contractId: string) {
    return this.terminations.get(contractId) ?? null;
  }

  async saveTermination(
    contractId: string,
    data: { noticeDate: Date; effectiveDate: Date; cause: string; indemnityRef: string | null },
  ) {
    const row = { id: `term-${contractId}`, contractId, ...data };
    this.terminations.set(contractId, row);
    return row;
  }

  async markContractTerminated(id: string) {
    const found = this.contracts.get(id);
    if (!found) {
      throw new Error("Contract not found.");
    }
    found.status = "TERMINATED";
    return found;
  }

  async paymentsTotalMinor(propertyId: string, from: Date, to: Date): Promise<number> {
    let total = 0;
    for (const payment of this.payments.values()) {
      const contract = this.contracts.get(payment.contractId);
      if (
        contract &&
        contract.propertyId === propertyId &&
        payment.paidAt >= from &&
        payment.paidAt < to
      ) {
        total += payment.amountMinor;
      }
    }
    return total;
  }

  async activeOwnershipShares(
    propertyId: string,
  ): Promise<{ ownerId: string; sharePct: number }[]> {
    return this.properties.get(propertyId)?.shares ?? [];
  }

  async findCommissionPct(): Promise<number> {
    return 0;
  }

  async findSettlement(propertyId: string, period: string): Promise<SettlementDetail | null> {
    for (const settlement of this.settlements.values()) {
      if (settlement.propertyId === propertyId && settlement.period === period) {
        return settlement;
      }
    }
    return null;
  }

  async findSettlementById(id: string): Promise<SettlementDetail | null> {
    return this.settlements.get(id) ?? null;
  }

  async createSettlement(data: {
    orgId: string;
    propertyId: string;
    period: string;
    collectedMinor: number;
    commissionMinor: number;
    deductionsMinor: number;
    netMinor: number;
    currency: string;
    lines: { ownerId: string; sharePct: number; grossMinor: number; netMinor: number }[];
  }): Promise<SettlementDetail> {
    const id = `settlement-${this.settlements.size + 1}`;
    const detail: SettlementDetail = { id, ...data, payoutRef: null, payoutAt: null };
    this.settlements.set(id, detail);
    return detail;
  }

  async recordPayout(id: string, transferRef: string, paidAt: Date): Promise<SettlementDetail> {
    const existing = this.settlements.get(id);
    if (!existing) {
      throw new Error("Settlement not found.");
    }
    const updated: SettlementDetail = {
      ...existing,
      payoutRef: transferRef,
      payoutAt: paidAt.toISOString(),
    };
    this.settlements.set(id, updated);
    return updated;
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const world = new FakeWorld();

@Module({
  controllers: [
    AuthController,
    OrganizationsController,
    PropertiesController,
    RentalController,
    SettlementsController,
  ],
  providers: [
    AuthService,
    OrganizationsService,
    PropertiesService,
    RentalService,
    SettlementsService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: world },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: ORGS_STORE, useValue: world },
    { provide: PROPERTIES_STORE, useValue: world },
    { provide: RENTAL_STORE, useValue: world },
    { provide: SETTLEMENTS_STORE, useValue: world },
  ],
})
class StageBTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  world.users.set("user-1", {
    id: "user-1",
    email: "admin@ejemplo.co",
    passwordHash: hashPassword("correct-horse-1"),
    name: "Admin",
  });
  app = await NestFactory.create(StageBTestModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe("Stage B E2E gate (steps 1-10)", () => {
  test("full vertical slice: sign in to owner settlement", async () => {
    const json = async (response: Response) => (await response.json()) as never;

    // 1. Sign in.
    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@ejemplo.co", password: "correct-horse-1" }),
    });
    expect(login.status).toBe(200);
    const token = ((await login.json()) as { accessToken: string }).accessToken;
    const headers = (org: string): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      "X-Org-Id": org,
      "Content-Type": "application/json",
    });

    // 2. Create organization (caller becomes admin).
    const orgResponse = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: "POST",
      headers: {
        ...headers(""),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "E2E Inmobiliaria" }),
    });
    expect(orgResponse.status).toBe(201);
    const org = (await orgResponse.json()) as { id: string; slug: string };
    expect(org.slug).toBe("e2e-inmobiliaria");
    const me = (await (
      await fetch(`${baseUrl}/api/v1/auth/me`, { headers: headers(org.id) })
    ).json()) as { memberships: { orgId: string }[] };
    expect(me.memberships.map((entry) => entry.orgId)).toContain(org.id);

    // 3. Guided property/units setup with bulk units.
    const propertyResponse = await fetch(`${baseUrl}/api/v1/properties`, {
      method: "POST",
      headers: headers(org.id),
      body: JSON.stringify({
        name: "Edificio E2E",
        address: "Calle 1 #2-3",
        city: "Bogotá",
        phEnabled: false,
        units: [
          { code: "101", subtype: "RESIDENTIAL" },
          { code: "102", subtype: "RESIDENTIAL" },
        ],
      }),
    });
    expect(propertyResponse.status).toBe(201);
    const property = (await propertyResponse.json()) as {
      id: string;
      units: { id: string; code: string }[];
    };
    const unit101 = property.units.find((unit) => unit.code === "101")?.id ?? "";

    // 4. Add owners (70/30).
    const addOwner = (name: string, sharePct: number) =>
      fetch(`${baseUrl}/api/v1/owners`, {
        method: "POST",
        headers: headers(org.id),
        body: JSON.stringify({ propertyId: property.id, name, sharePct, startDate: "2026-01-01" }),
      });
    expect((await addOwner("Owner A", 70)).status).toBe(201);
    expect((await addOwner("Owner B", 30)).status).toBe(201);

    // 5. Add tenant with tenancy.
    const tenantResponse = await fetch(`${baseUrl}/api/v1/tenants`, {
      method: "POST",
      headers: headers(org.id),
      body: JSON.stringify({
        propertyId: property.id,
        unitId: unit101,
        name: "Tenant E2E",
        startDate: "2026-02-01",
      }),
    });
    expect(tenantResponse.status).toBe(201);
    const tenant = (await tenantResponse.json()) as { id: string };

    // 6. Create contract.
    const contractResponse = await fetch(`${baseUrl}/api/v1/contracts`, {
      method: "POST",
      headers: headers(org.id),
      body: JSON.stringify({
        propertyId: property.id,
        tenantId: tenant.id,
        number: "C-E2E-001",
        startDate: "2026-02-01",
        endDate: "2027-01-31",
        rentAmount: 1800000,
      }),
    });
    expect(contractResponse.status).toBe(201);
    const contract = (await contractResponse.json()) as { id: string };

    // 7. Generate monthly charges.
    const chargeResponse = await fetch(
      `${baseUrl}/api/v1/contracts/${contract.id}/charges:generate`,
      {
        method: "POST",
        headers: headers(org.id),
        body: JSON.stringify({ period: "2026-02" }),
      },
    );
    expect(chargeResponse.status).toBe(201);
    const generated = (await chargeResponse.json()) as { created: boolean };
    expect(generated.created).toBe(true);

    // 8. Record payment in full.
    const paymentResponse = await fetch(`${baseUrl}/api/v1/contracts/${contract.id}/payments`, {
      method: "POST",
      headers: headers(org.id),
      body: JSON.stringify({
        amount: 1800000,
        method: "TRANSFER",
        reference: "E2E-001",
        paidAt: "2026-02-04",
      }),
    });
    expect(paymentResponse.status).toBe(201);
    const payment = (await paymentResponse.json()) as {
      allocations: { amount: number }[];
      remainder: number;
      receipt: { id: string };
    };
    expect(payment.allocations).toHaveLength(1);
    expect(payment.remainder).toBe(0);

    // 9. Generate receipt (issued automatically, retrievable).
    const receipt = await fetch(`${baseUrl}/api/v1/receipts/${payment.receipt.id}`, {
      headers: headers(org.id),
    });
    expect(receipt.status).toBe(200);

    // 10. Generate owner settlement split by ownership %.
    const settlementResponse = await fetch(`${baseUrl}/api/v1/settlements`, {
      method: "POST",
      headers: headers(org.id),
      body: JSON.stringify({ propertyId: property.id, period: "2026-02" }),
    });
    expect(settlementResponse.status).toBe(201);
    const { settlement } = (await settlementResponse.json()) as {
      settlement: {
        id: string;
        collectedMinor: number;
        commissionMinor: number;
        netMinor: number;
        lines: { sharePct: number; netMinor: number }[];
      };
    };
    expect(settlement.collectedMinor).toBe(180000000);
    expect(settlement.commissionMinor).toBe(0);
    expect(settlement.netMinor).toBe(180000000);
    expect(
      settlement.lines.map((line) => line.netMinor).reduce((total, net) => total + net, 0),
    ).toBe(180000000);
    expect(settlement.lines.map((line) => line.sharePct).sort()).toEqual([30, 70]);

    expect(world.audits).toEqual(
      expect.arrayContaining([
        "auth.login",
        "organization.created",
        "property.created",
        "contract.created",
        "payment.recorded",
        "settlement.generated",
      ]),
    );
    void json;
  });
});
