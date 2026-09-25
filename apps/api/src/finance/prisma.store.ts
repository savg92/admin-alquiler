import { prisma } from "@admin-alquiler/database";
import type {
  AuditInput,
  BankRowInput,
  BankTxRow,
  CreateBankTxResult,
  FinanceStore,
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
