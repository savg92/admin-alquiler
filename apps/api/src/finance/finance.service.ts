import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  buildAuditEvent,
  decideImport,
  dedupeKey,
  parseBankCsv,
  suggestMatches,
  validateAccount,
  validateCategoryName,
  validateLedgerTransaction,
  type SupportedBank,
} from "@admin-alquiler/domain";
import { FINANCE_STORE } from "./tokens";
import type { FinanceStore, LedgerTransactionInput } from "./store";

const SUPPORTED_BANKS: readonly string[] = ["BANCOLOMBIA", "DAVIVIENDA"];

function isSupportedBank(value: string): value is SupportedBank {
  return (SUPPORTED_BANKS as readonly string[]).includes(value);
}

@Injectable()
export class FinanceService {
  constructor(@Inject(FINANCE_STORE) private readonly store: FinanceStore) {}

  async importBank(orgId: string, actorId: string, bank: string, csv: string) {
    if (!isSupportedBank(bank)) {
      throw new BadRequestException(
        `Unsupported bank "${bank}". Expected one of: ${SUPPORTED_BANKS.join(", ")}.`,
      );
    }
    let rows;
    try {
      rows = parseBankCsv(bank, csv);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid CSV.");
    }
    const { toCreate, quarantined } = decideImport(rows);
    const existing = await this.store.listBankTransactions(orgId);
    const existingKeys = new Set(existing.map((row) => dedupeKey(bank, row)));
    const seen = new Set<string>();
    let created = 0;
    let duplicates = 0;
    for (const row of toCreate) {
      const key = dedupeKey(bank, row);
      if (existingKeys.has(key) || seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
      const result = await this.store.tryCreateBankTransaction(orgId, bank, {
        ...row,
        quarantined: false,
      });
      if ("conflict" in result) {
        duplicates += 1;
      } else {
        created += 1;
      }
    }
    let quarantinedCount = 0;
    for (const row of quarantined) {
      const result = await this.store.tryCreateBankTransaction(orgId, bank, {
        ...row,
        quarantined: true,
      });
      if (!("conflict" in result)) {
        quarantinedCount += 1;
      } else {
        duplicates += 1;
      }
    }
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "bank_import.completed",
        entityType: "BankTransaction",
        metadata: { bank, created, duplicates, quarantined: quarantinedCount },
      }),
    );
    return { created, duplicates, quarantined: quarantinedCount };
  }

  async listBankTransactions(orgId: string, quarantined?: boolean) {
    return this.store.listBankTransactions(orgId, quarantined);
  }

  async suggestMatches(orgId: string, bankTransactionId: string) {
    const tx = await this.store.findBankTransaction(bankTransactionId, orgId);
    if (!tx) {
      throw new NotFoundException("Bank transaction not found.");
    }
    const from = new Date(tx.transactionAt.getTime() - 7 * 86_400_000);
    const to = new Date(tx.transactionAt.getTime() + 7 * 86_400_000);
    const candidates = await this.store.paymentCandidates(orgId, from, to);
    return suggestMatches(
      { amountMinor: tx.amountMinor, transactionAt: tx.transactionAt, reference: tx.reference },
      candidates,
    );
  }

  async confirmReconciliation(
    orgId: string,
    actorId: string,
    bankTransactionId: string,
    note?: string,
  ) {
    const tx = await this.store.findBankTransaction(bankTransactionId, orgId);
    if (!tx) {
      throw new NotFoundException("Bank transaction not found.");
    }
    if (await this.store.findReconciliationByTx(bankTransactionId)) {
      throw new ConflictException("Bank transaction is already reconciled.");
    }
    const reconciliation = await this.store.createReconciliation(
      bankTransactionId,
      actorId,
      note ?? null,
    );
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "reconciliation.confirmed",
        entityType: "Reconciliation",
        entityId: reconciliation.id,
      }),
    );
    return reconciliation;
  }

  async createAccount(orgId: string, actorId: string, code: string, name: string) {
    try {
      validateAccount({ code, name });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid account.");
    }
    const trimmedCode = code.trim();
    if (await this.store.isAccountCodeTaken(orgId, trimmedCode)) {
      throw new ConflictException("Account code already exists.");
    }
    const created = await this.store.createAccount(orgId, trimmedCode, name.trim());
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "account.created",
        entityType: "Account",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listAccounts(orgId: string) {
    return this.store.listAccounts(orgId);
  }

  async createCategory(orgId: string, actorId: string, name: string) {
    try {
      validateCategoryName(name);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid category.");
    }
    const trimmed = name.trim();
    if (await this.store.isCategoryNameTaken(orgId, trimmed)) {
      throw new ConflictException("Category name already exists.");
    }
    const created = await this.store.createCategory(orgId, trimmed);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "category.created",
        entityType: "Category",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listCategories(orgId: string) {
    return this.store.listCategories(orgId);
  }

  async recordTransaction(orgId: string, actorId: string, input: LedgerTransactionInput) {
    let amountMinor: number;
    try {
      amountMinor = validateLedgerTransaction({
        amount: input.amount,
        currency: input.currency,
        source: input.source,
        occurredAt: input.occurredAt,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid transaction.",
      );
    }
    const account = await this.store.findAccount(input.accountId, orgId);
    if (!account) {
      throw new NotFoundException("Account not found.");
    }
    let categoryId: string | null = null;
    if (input.categoryId !== undefined) {
      const category = await this.store.findCategory(input.categoryId, orgId);
      if (!category) {
        throw new NotFoundException("Category not found.");
      }
      categoryId = category.id;
    }
    const occurredAt = new Date(input.occurredAt);
    const created = await this.store.createLedgerTransaction(orgId, {
      accountId: account.id,
      categoryId,
      amountMinor,
      currency: input.currency.toUpperCase(),
      source: input.source.trim(),
      occurredAt,
      reference: typeof input.reference === "string" ? input.reference : null,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "transaction.recorded",
        entityType: "FinancialTransaction",
        entityId: created.id,
        metadata: { amountMinor },
      }),
    );
    return created;
  }

  async listTransactions(
    orgId: string,
    filter: { accountId?: string; from?: string; to?: string },
  ) {
    let from: Date | undefined;
    let to: Date | undefined;
    if (filter.from !== undefined) {
      const parsed = new Date(filter.from);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid date "from".');
      }
      from = parsed;
    }
    if (filter.to !== undefined) {
      const parsed = new Date(filter.to);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid date "to".');
      }
      to = parsed;
    }
    if (filter.accountId !== undefined) {
      const account = await this.store.findAccount(filter.accountId, orgId);
      if (!account) {
        throw new NotFoundException("Account not found.");
      }
    }
    return this.store.listLedgerTransactions(
      orgId,
      from === undefined && to === undefined && filter.accountId === undefined
        ? {}
        : {
            ...(filter.accountId === undefined ? {} : { accountId: filter.accountId }),
            ...(from === undefined ? {} : { from }),
            ...(to === undefined ? {} : { to }),
          },
    );
  }
}
