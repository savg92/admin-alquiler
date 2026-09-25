import "reflect-metadata";
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import { dedupeKey } from "@admin-alquiler/domain";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { FinanceController } from "../src/finance/finance.controller";
import { FinanceService } from "../src/finance/finance.service";
import type {
  BankRowInput,
  BankTxRow,
  CreateBankTxResult,
  FinanceStore,
  PaymentCandidate,
} from "../src/finance/store";
import { FINANCE_STORE } from "../src/finance/tokens";
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

class FakeFinanceStore implements FinanceStore {
  rows: (BankTxRow & { orgId: string })[] = [];
  reconciliations = new Map<string, string>();
  payments: PaymentCandidate[] = [
    { id: "pay-1", amountMinor: 180000000, paidAt: "2026-02-04", reference: "PAGO ARRIENDO 101" },
  ];
  audits: string[] = [];

  async listBankTransactions(orgId: string, quarantined?: boolean): Promise<BankTxRow[]> {
    return this.rows
      .filter(
        (row) =>
          row.orgId === orgId && (quarantined === undefined || row.quarantined === quarantined),
      )
      .map(({ orgId: _o, ...rest }) => rest);
  }

  async findBankTransaction(id: string, orgId: string): Promise<BankTxRow | null> {
    const found = this.rows.find((row) => row.id === id && row.orgId === orgId);
    if (!found) {
      return null;
    }
    const { orgId: _o, ...rest } = found;
    return rest;
  }

  async tryCreateBankTransaction(
    orgId: string,
    bank: string,
    row: BankRowInput,
  ): Promise<CreateBankTxResult> {
    const key = dedupeKey(bank, row);
    for (const existing of this.rows) {
      if (existing.orgId === orgId && dedupeKey(existing.bank, existing) === key) {
        return { conflict: true };
      }
    }
    const created: BankTxRow & { orgId: string } = {
      id: `banktx-${this.rows.length + 1}`,
      bank,
      accountRef: row.accountRef,
      amountMinor: row.amountMinor,
      currency: row.currency,
      reference: row.reference,
      transactionAt: row.transactionAt,
      quarantined: row.quarantined,
      orgId,
    };
    this.rows.push(created);
    const { orgId: _o, ...rest } = created;
    return { row: rest };
  }

  async paymentCandidates(): Promise<PaymentCandidate[]> {
    return this.payments;
  }

  async findReconciliationByTx(bankTransactionId: string): Promise<{ id: string } | null> {
    const id = this.reconciliations.get(bankTransactionId);
    return id ? { id } : null;
  }

  async createReconciliation(
    bankTransactionId: string,
    confirmedBy: string,
  ): Promise<{ id: string }> {
    const id = `rec-${this.reconciliations.size + 1}`;
    this.reconciliations.set(bankTransactionId, id);
    void confirmedBy;
    return { id };
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const authStore = new FakeAuthStore();
const financeStore = new FakeFinanceStore();

@Module({
  controllers: [AuthController, FinanceController],
  providers: [
    AuthService,
    FinanceService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: FINANCE_STORE, useValue: financeStore },
  ],
})
class FinanceTestModule implements NestModule {
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

const BANCOLOMBIA_CSV = `fecha,descripcion,valor,cuenta
2026-02-04,PAGO ARRIENDO 101,1800000,123-456
2026-02-05,PAGO ARRIENDO 102,1800000,123-456`;

const DAVIVIENDA_CONFLICT_CSV = `fecha,descripcion,debito,credito,cuenta
2026-02-04,TRANSFERENCIA,,1800000,789
2026-02-04,TRANSFERENCIA,,1700000,789`;

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
      permissions: ["finance:read", "finance:write"],
    },
  ]);
  app = await NestFactory.create(FinanceTestModule, { logger: false });
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

describe("finance imports", () => {
  test("imports Bancolombia CSV with dedupe on re-import", async () => {
    const importCsv = () =>
      fetch(`${baseUrl}/api/v1/bank-imports`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ bank: "BANCOLOMBIA", csv: BANCOLOMBIA_CSV }),
      });
    const first = (await (await importCsv()).json()) as {
      created: number;
      duplicates: number;
      quarantined: number;
    };
    expect(first).toEqual({ created: 2, duplicates: 0, quarantined: 0 });
    const second = (await (await importCsv()).json()) as {
      created: number;
      duplicates: number;
      quarantined: number;
    };
    expect(second).toEqual({ created: 0, duplicates: 2, quarantined: 0 });
    expect(financeStore.audits).toContain("bank_import.completed");
  });

  test("rejects unsupported banks and bad CSV", async () => {
    const badBank = await fetch(`${baseUrl}/api/v1/bank-imports`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ bank: "OTRO", csv: BANCOLOMBIA_CSV }),
    });
    expect(badBank.status).toBe(400);
    const badCsv = await fetch(`${baseUrl}/api/v1/bank-imports`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ bank: "BANCOLOMBIA", csv: "fecha,valor\n2026-02-04,100" }),
    });
    expect(badCsv.status).toBe(400);
  });

  test("conflicting reference groups are quarantined", async () => {
    const response = await fetch(`${baseUrl}/api/v1/bank-imports`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ bank: "DAVIVIENDA", csv: DAVIVIENDA_CONFLICT_CSV }),
    });
    const body = (await response.json()) as { created: number; quarantined: number };
    expect(body.created).toBe(0);
    expect(body.quarantined).toBe(2);
    const quarantined = (await (
      await fetch(`${baseUrl}/api/v1/bank-transactions?quarantined=true`, {
        headers: headers(),
      })
    ).json()) as { quarantined: boolean }[];
    expect(quarantined.length).toBeGreaterThan(0);
    expect(quarantined.every((row) => row.quarantined)).toBe(true);
  });

  test("suggestions rank payment matches and confirm is human-gated", async () => {
    const rows = (await (
      await fetch(`${baseUrl}/api/v1/bank-transactions`, { headers: headers() })
    ).json()) as { id: string; reference: string | null }[];
    const target = rows.find((row) => row.reference === "PAGO ARRIENDO 101");
    expect(target).toBeDefined();
    const suggestions = (await (
      await fetch(`${baseUrl}/api/v1/bank-transactions/${target?.id}/suggestions`, {
        headers: headers(),
      })
    ).json()) as { id: string }[];
    expect(suggestions.map((item) => item.id)).toContain("pay-1");

    const confirm = (id: string | undefined) =>
      fetch(`${baseUrl}/api/v1/reconciliations`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ bankTransactionId: id, note: "matches payment" }),
      });
    expect((await confirm(target?.id)).status).toBe(201);
    expect((await confirm(target?.id)).status).toBe(409);
    expect((await confirm("banktx-unknown")).status).toBe(404);
    expect(financeStore.audits).toContain("reconciliation.confirmed");
  });

  test("unauthenticated and cross-org calls fail", async () => {
    const anonymous = await fetch(`${baseUrl}/api/v1/bank-transactions`);
    expect(anonymous.status).toBe(403);
    const crossOrg = await fetch(`${baseUrl}/api/v1/bank-transactions`, {
      headers: headers("org-b"),
    });
    expect(crossOrg.status).toBe(403);
  });
});
