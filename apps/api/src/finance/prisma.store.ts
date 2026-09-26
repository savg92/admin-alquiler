import { prisma } from "@admin-alquiler/database";
import type {
  AccountRow,
  AuditInput,
  BankRowInput,
  BankTxRow,
  CategoryRow,
  CreateBankTxResult,
  FinanceStore,
  LedgerTransactionRow,
  PaymentCandidate,
} from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

const toMinor = (value: { toNumber(): number }): number => Math.round(value.toNumber() * 100);

function toRow(row: {
  id: string;
  bank: string;
  accountRef: string;
  amount: { toNumber(): number };
  currency: string;
  reference: string | null;
  transactionAt: Date;
  quarantined: boolean;
}): BankTxRow {
  return {
    id: row.id,
    bank: row.bank,
    accountRef: row.accountRef,
    amountMinor: toMinor(row.amount),
    currency: row.currency,
    reference: row.reference,
    transactionAt: row.transactionAt,
    quarantined: row.quarantined,
  };
}

export class PrismaFinanceStore implements FinanceStore {
  async listBankTransactions(orgId: string, quarantined?: boolean): Promise<BankTxRow[]> {
    const rows = await prisma.bankTransaction.findMany({
      where: { orgId, ...(quarantined === undefined ? {} : { quarantined }) },
      orderBy: { transactionAt: "desc" },
    });
    return rows.map(toRow);
  }

  async findBankTransaction(id: string, orgId: string): Promise<BankTxRow | null> {
    const row = await prisma.bankTransaction.findFirst({ where: { id, orgId } });
    return row ? toRow(row) : null;
  }

  async tryCreateBankTransaction(
    orgId: string,
    bank: string,
    row: BankRowInput,
  ): Promise<CreateBankTxResult> {
    try {
      const created = await prisma.bankTransaction.create({
        data: {
          orgId,
          bank,
          accountRef: row.accountRef,
          amount: row.amountMinor / 100,
          currency: row.currency,
          reference: row.reference,
          transactionAt: row.transactionAt,
          raw: toJsonInput(row.raw),
          quarantined: row.quarantined,
        },
      });
      return { row: toRow(created) };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      return { conflict: true };
    }
  }

  async paymentCandidates(orgId: string, from: Date, to: Date): Promise<PaymentCandidate[]> {
    const rows = await prisma.payment.findMany({
      where: { orgId, paidAt: { gte: from, lt: to } },
      select: { id: true, amount: true, paidAt: true, reference: true },
    });
    return rows.map((row) => ({
      id: row.id,
      amountMinor: toMinor(row.amount),
      paidAt: row.paidAt.toISOString().slice(0, 10),
      reference: row.reference,
    }));
  }

  async findReconciliationByTx(bankTransactionId: string): Promise<{ id: string } | null> {
    return prisma.reconciliation.findUnique({
      where: { bankTransactionId },
      select: { id: true },
    });
  }

  async createReconciliation(
    bankTransactionId: string,
    confirmedBy: string,
    note: string | null,
  ): Promise<{ id: string }> {
    const created = await prisma.reconciliation.create({
      data: { bankTransactionId, confirmedBy, note },
      select: { id: true },
    });
    return created;
  }

  async createAccount(orgId: string, code: string, name: string): Promise<AccountRow> {
    try {
      const created = await prisma.account.create({ data: { orgId, code, name } });
      return { id: created.id, code: created.code, name: created.name };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await prisma.account.findUnique({
        where: { orgId_code: { orgId, code } },
      });
      if (!existing) {
        throw error;
      }
      return { id: existing.id, code: existing.code, name: existing.name };
    }
  }

  async listAccounts(orgId: string): Promise<AccountRow[]> {
    const rows = await prisma.account.findMany({ where: { orgId }, orderBy: { code: "asc" } });
    return rows.map((row) => ({ id: row.id, code: row.code, name: row.name }));
  }

  async findAccount(id: string, orgId: string): Promise<AccountRow | null> {
    const row = await prisma.account.findFirst({ where: { id, orgId } });
    return row ? { id: row.id, code: row.code, name: row.name } : null;
  }

  async isAccountCodeTaken(orgId: string, code: string): Promise<boolean> {
    const found = await prisma.account.findUnique({
      where: { orgId_code: { orgId, code } },
      select: { id: true },
    });
    return found !== null;
  }

  async createCategory(orgId: string, name: string): Promise<CategoryRow> {
    try {
      const created = await prisma.category.create({ data: { orgId, name } });
      return { id: created.id, name: created.name };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await prisma.category.findUnique({
        where: { orgId_name: { orgId, name } },
      });
      if (!existing) {
        throw error;
      }
      return { id: existing.id, name: existing.name };
    }
  }

  async listCategories(orgId: string): Promise<CategoryRow[]> {
    const rows = await prisma.category.findMany({ where: { orgId }, orderBy: { name: "asc" } });
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async findCategory(id: string, orgId: string): Promise<CategoryRow | null> {
    const row = await prisma.category.findFirst({ where: { id, orgId } });
    return row ? { id: row.id, name: row.name } : null;
  }

  async isCategoryNameTaken(orgId: string, name: string): Promise<boolean> {
    const found = await prisma.category.findUnique({
      where: { orgId_name: { orgId, name } },
      select: { id: true },
    });
    return found !== null;
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
  ): Promise<LedgerTransactionRow> {
    const created = await prisma.financialTransaction.create({
      data: {
        orgId,
        accountId: data.accountId,
        categoryId: data.categoryId,
        amount: data.amountMinor / 100,
        currency: data.currency,
        source: data.source,
        occurredAt: data.occurredAt,
        reference: data.reference,
      },
    });
    return {
      id: created.id,
      accountId: created.accountId,
      categoryId: created.categoryId,
      amountMinor: toMinor(created.amount),
      currency: created.currency,
      source: created.source,
      occurredAt: created.occurredAt,
      reference: created.reference,
    };
  }

  async listLedgerTransactions(
    orgId: string,
    filter: { accountId?: string; from?: Date; to?: Date },
  ): Promise<LedgerTransactionRow[]> {
    const rows = await prisma.financialTransaction.findMany({
      where: {
        orgId,
        ...(filter.accountId === undefined ? {} : { accountId: filter.accountId }),
        ...(filter.from === undefined && filter.to === undefined
          ? {}
          : {
              occurredAt: {
                ...(filter.from === undefined ? {} : { gte: filter.from }),
                ...(filter.to === undefined ? {} : { lt: filter.to }),
              },
            }),
      },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      categoryId: row.categoryId,
      amountMinor: toMinor(row.amount),
      currency: row.currency,
      source: row.source,
      occurredAt: row.occurredAt,
      reference: row.reference,
    }));
  }

  async writeAuditEvent(event: AuditInput): Promise<void> {
    await prisma.auditEvent.create({
      data: {
        ...(event.orgId === undefined ? {} : { orgId: event.orgId }),
        ...(event.actorId === undefined ? {} : { actorId: event.actorId }),
        action: event.action,
        ...(event.entityType === undefined ? {} : { entityType: event.entityType }),
        ...(event.entityId === undefined ? {} : { entityId: event.entityId }),
        ...(event.metadata === undefined ? {} : { metadata: toJsonInput(event.metadata) }),
      },
    });
  }
}
