import "reflect-metadata";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
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
import { RequestIdMiddleware } from "../src/request-id.middleware";
import { RentalController } from "../src/rental/rental.controller";
import { RentalService } from "../src/rental/rental.service";
import type { ChargeBalanceInput, ChargeRow, ContractRow, RentalStore } from "../src/rental/store";
import { RENTAL_STORE } from "../src/rental/tokens";

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

  async touchSession(): Promise<void> {}

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

interface StoredCharge extends ChargeRow {
  allocatedMinor: number;
}

class FakeRentalStore implements RentalStore {
  contracts = new Map<string, ContractRow>();
  charges = new Map<string, StoredCharge>();
  audits: string[] = [];
  numbers = new Set<string>();

  properties = new Set<string>(["prop-1"]);
  tenants = new Set<string>(["tenant-1"]);

  async findOrgProfile(): Promise<{ currency: string; locale: string }> {
    return { currency: "COP", locale: "es-CO" };
  }

  async findProperty(propertyId: string): Promise<{ id: string } | null> {
    return this.properties.has(propertyId) ? { id: propertyId } : null;
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
      currency: "COP",
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

  async findCharge(contractId: string, period: string, type: string): Promise<ChargeRow | null> {
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
  }): Promise<ChargeRow> {
    const id = `charge-${this.charges.size + 1}`;
    const stored: StoredCharge = {
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

  async pendingChargeBalances(contractId: string): Promise<ChargeBalanceInput[]> {
    return [...this.charges.values()]
      .filter((charge) => charge.contractId === contractId && charge.status !== "PAID")
      .map((charge) => ({
        id: charge.id,
        balanceMinor: charge.amountMinor - charge.allocatedMinor,
        dueDate: charge.dueDate.toISOString().slice(0, 10),
      }));
  }

  async createPayment(): Promise<{ id: string }> {
    return { id: `payment-${Date.now()}` };
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
    return { id: `receipt-${paymentId}`, number, locale };
  }

  async findReceipt(
    id: string,
  ): Promise<{ id: string; number: string; locale: string; paymentId: string } | null> {
    if (!id.startsWith("receipt-")) {
      return null;
    }
    return { id, number: "R-TEST", locale: "es-CO", paymentId: id.replace("receipt-", "") };
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const authStore = new FakeAuthStore();
const rentalStore = new FakeRentalStore();

@Module({
  controllers: [AuthController, RentalController],
  providers: [
    AuthService,
    RentalService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: RENTAL_STORE, useValue: rentalStore },
  ],
})
class RentalTestModule implements NestModule {
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
      permissions: ["contract:read", "contract:write", "payment:read", "payment:write"],
    },
  ]);
  app = await NestFactory.create(RentalTestModule, { logger: false });
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

describe("rental core", () => {
  test("creates a contract with validated terms", async () => {
    const response = await fetch(`${baseUrl}/api/v1/contracts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        propertyId: "prop-1",
        tenantId: "tenant-1",
        number: "C-2026-001",
        startDate: "2026-02-01",
        endDate: "2027-01-31",
        rentAmount: 1800000,
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; number: string; status: string };
    expect(body.number).toBe("C-2026-001");
    expect(body.status).toBe("ACTIVE");
    expect(rentalStore.audits).toContain("contract.created");
  });

  test("rejects invalid terms, unknown parties and duplicate numbers", async () => {
    const base = {
      propertyId: "prop-1",
      tenantId: "tenant-1",
      number: "C-2026-002",
      startDate: "2026-02-01",
      endDate: "2027-01-31",
      rentAmount: 1800000,
    };
    const badDates = await fetch(`${baseUrl}/api/v1/contracts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...base, startDate: "2027-01-31", endDate: "2026-02-01" }),
    });
    expect(badDates.status).toBe(400);
    const unknownProp = await fetch(`${baseUrl}/api/v1/contracts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...base, propertyId: "prop-unknown" }),
    });
    expect(unknownProp.status).toBe(404);
    const duplicate = await fetch(`${baseUrl}/api/v1/contracts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(base),
    });
    expect(duplicate.status).toBe(201);
    const duplicateAgain = await fetch(`${baseUrl}/api/v1/contracts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(base),
    });
    expect(duplicateAgain.status).toBe(409);
  });

  test("monthly charge generation is idempotent per period", async () => {
    const contracts = (await (
      await fetch(`${baseUrl}/api/v1/contracts`, { headers: headers() })
    ).json()) as { id: string }[];
    const contractId = contracts[0]?.id ?? "";
    const generate = () =>
      fetch(`${baseUrl}/api/v1/contracts/${contractId}/charges:generate`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ period: "2026-02" }),
      });
    const first = (await (await generate()).json()) as {
      charge: { id: string; period: string };
      created: boolean;
    };
    expect(first.created).toBe(true);
    expect(first.charge.period).toBe("2026-02");
    const second = (await (await generate()).json()) as {
      charge: { id: string };
      created: boolean;
    };
    expect(second.created).toBe(false);
    expect(second.charge.id).toBe(first.charge.id);
    const badPeriod = await fetch(`${baseUrl}/api/v1/contracts/${contractId}/charges:generate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ period: "febrero" }),
    });
    expect(badPeriod.status).toBe(400);
  });

  test("payments allocate oldest-first and issue receipts", async () => {
    const contracts = (await (
      await fetch(`${baseUrl}/api/v1/contracts`, { headers: headers() })
    ).json()) as { id: string }[];
    const contractId = contracts[0]?.id ?? "";
    await fetch(`${baseUrl}/api/v1/contracts/${contractId}/charges:generate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ period: "2026-03" }),
    });
    const pay = (amount: number) =>
      fetch(`${baseUrl}/api/v1/contracts/${contractId}/payments`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          amount,
          method: "TRANSFER",
          reference: "PAY-1",
          paidAt: "2026-02-04",
        }),
      });
    const paid = (await (await pay(2000000)).json()) as {
      allocations: { chargeId: string; amount: number }[];
      remainder: number;
      receipt: { id: string };
    };
    expect(paid.allocations).toHaveLength(2);
    expect(paid.allocations.reduce((total, item) => total + item.amount, 0)).toBe(2000000);
    expect(paid.remainder).toBe(0);
    const balances = (await (
      await fetch(`${baseUrl}/api/v1/contracts/${contractId}/charges`, { headers: headers() })
    ).json()) as { id: string; balanceMinor: number }[];
    expect(balances).toHaveLength(1);
    expect(balances[0]?.balanceMinor).toBe(160000000);
    const rest = (await (await pay(1600000)).json()) as {
      allocations: { chargeId: string; amount: number }[];
      remainder: number;
      receipt: { id: string };
    };
    expect(rest.remainder).toBe(0);
    expect(rest.allocations.reduce((total, item) => total + item.amount, 0)).toBe(1600000);
    const receipt = await fetch(`${baseUrl}/api/v1/receipts/${rest.receipt.id}`, {
      headers: headers(),
    });
    expect(receipt.status).toBe(200);
    expect(rentalStore.audits).toContain("payment.recorded");
  });

  test("cross-org contracts are isolated and anonymous calls fail", async () => {
    const contracts = await fetch(`${baseUrl}/api/v1/contracts`, { headers: headers("org-b") });
    expect(contracts.status).toBe(403);
    const anonymous = await fetch(`${baseUrl}/api/v1/contracts`);
    expect(anonymous.status).toBe(403);
  });
});
