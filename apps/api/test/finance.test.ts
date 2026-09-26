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

  accounts = new Map<string, { id: string; orgId: string; code: string; name: string }>();
  categories = new Map<string, { id: string; orgId: string; name: string }>();
  ledger: {
    id: string;
    orgId: string;
    accountId: string;
    categoryId: string | null;
    amountMinor: number;
    currency: string;
    source: string;
    occurredAt: Date;
    reference: string | null;
  }[] = [];

  async createAccount(orgId: string, code: string, name: string) {
    const row = { id: `acc-${this.accounts.size + 1}`, orgId, code, name };
    this.accounts.set(row.id, row);
    return { id: row.id, code: row.code, name: row.name };
  }

  async listAccounts(orgId: string) {
    return [...this.accounts.values()]
      .filter((row) => row.orgId === orgId)
      .map((row) => ({ id: row.id, code: row.code, name: row.name }));
  }

  async findAccount(id: string, orgId: string) {
    const found = this.accounts.get(id);
    if (!found || found.orgId !== orgId) {
      return null;
    }
    return { id: found.id, code: found.code, name: found.name };
  }

  async isAccountCodeTaken(orgId: string, code: string) {
    return [...this.accounts.values()].some((row) => row.orgId === orgId && row.code === code);
  }

  async createCategory(orgId: string, name: string) {
    const row = { id: `cat-${this.categories.size + 1}`, orgId, name };
    this.categories.set(row.id, row);
    return { id: row.id, name: row.name };
  }

  async listCategories(orgId: string) {
    return [...this.categories.values()]
      .filter((row) => row.orgId === orgId)
      .map((row) => ({ id: row.id, name: row.name }));
  }

  async findCategory(id: string, orgId: string) {
    const found = this.categories.get(id);
    if (!found || found.orgId !== orgId) {
      return null;
    }
    return { id: found.id, name: found.name };
  }

  async isCategoryNameTaken(orgId: string, name: string) {
    return [...this.categories.values()].some((row) => row.orgId === orgId && row.name === name);
  }

  async createLedgerTransaction(
    orgId: string,
    data: {
      accountId: string;
      categoryId: string | null;
      amountMinor: number;
      currency: string;
      source: string;
      occurredAt: Date;
      reference: string | null;
    },
  ) {
    const row = { id: `tx-${this.ledger.length + 1}`, orgId, ...data };
    this.ledger.push(row);
    return row;
  }

  async listLedgerTransactions(
    orgId: string,
    filter: { accountId?: string; from?: Date; to?: Date },
  ) {
    return this.ledger.filter(
      (row) =>
        row.orgId === orgId &&
        (filter.accountId === undefined || row.accountId === filter.accountId) &&
        (filter.from === undefined || row.occurredAt >= filter.from) &&
        (filter.to === undefined || row.occurredAt < filter.to),
    );
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

  test("accounts, categories and transactions enforce uniqueness and exact arithmetic", async () => {
    const account = (await (
      await fetch(`${baseUrl}/api/v1/accounts`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ code: "1105", name: "Caja" }),
      })
    ).json()) as { id: string; code: string };
    expect(account.code).toBe("1105");
    const duplicateAccount = await fetch(`${baseUrl}/api/v1/accounts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ code: "1105", name: "Caja otra" }),
    });
    expect(duplicateAccount.status).toBe(409);
    const category = (await (
      await fetch(`${baseUrl}/api/v1/categories`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ name: "Arriendo" }),
      })
    ).json()) as { id: string };
    const duplicateCategory = await fetch(`${baseUrl}/api/v1/categories`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: "Arriendo" }),
    });
    expect(duplicateCategory.status).toBe(409);
    const badCurrency = await fetch(`${baseUrl}/api/v1/transactions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        accountId: account.id,
        categoryId: category.id,
        amount: 1800000,
        currency: "XXX",
        source: "canon",
        occurredAt: "2026-02-04",
      }),
    });
    expect(badCurrency.status).toBe(400);
    const income = (await (
      await fetch(`${baseUrl}/api/v1/transactions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          accountId: account.id,
          categoryId: category.id,
          amount: 1800000.5,
          currency: "cop",
          source: "canon",
          occurredAt: "2026-02-04",
          reference: "R-1",
        }),
      })
    ).json()) as { amountMinor: number; currency: string };
    expect(income.amountMinor).toBe(180000050);
    expect(income.currency).toBe("COP");
    const expense = (await (
      await fetch(`${baseUrl}/api/v1/transactions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          accountId: account.id,
          amount: -250000,
          currency: "COP",
          source: "mantenimiento",
          occurredAt: "2026-02-06",
        }),
      })
    ).json()) as { amountMinor: number };
    expect(expense.amountMinor).toBe(-25000000);
    const filtered = (await (
      await fetch(
        `${baseUrl}/api/v1/transactions?accountId=${account.id}&from=2026-02-01&to=2026-03-01`,
        { headers: headers() },
      )
    ).json()) as { id: string }[];
    expect(filtered).toHaveLength(2);
    expect(financeStore.audits).toContain("transaction.recorded");
  });
});
