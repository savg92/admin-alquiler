export interface BankRowInput {
  accountRef: string;
  amountMinor: number;
  currency: string;
  reference: string | null;
  transactionAt: Date;
  raw: Record<string, string>;
  quarantined: boolean;
}

export interface BankTxRow {
  id: string;
  bank: string;
  accountRef: string;
  amountMinor: number;
  currency: string;
  reference: string | null;
  transactionAt: Date;
  quarantined: boolean;
}

export interface PaymentCandidate {
  id: string;
  amountMinor: number;
  paidAt: string;
  reference: string | null;
}

export interface AccountRow {
  id: string;
  code: string;
  name: string;
}

export interface CategoryRow {
  id: string;
  name: string;
}

export interface LedgerTransactionRow {
  id: string;
  accountId: string;
  categoryId: string | null;
  amountMinor: number;
  currency: string;
  source: string;
  occurredAt: Date;
  reference: string | null;
}

export interface LedgerTransactionInput {
  accountId: string;
  categoryId?: string;
  amount: number;
  currency: string;
  source: string;
  occurredAt: string;
  reference?: string | null;
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export type CreateBankTxResult = { row: BankTxRow } | { conflict: true };

export interface FinanceStore {
  listBankTransactions(orgId: string, quarantined?: boolean): Promise<BankTxRow[]>;
  findBankTransaction(id: string, orgId: string): Promise<BankTxRow | null>;
  tryCreateBankTransaction(
    orgId: string,
    bank: string,
    row: BankRowInput,
  ): Promise<CreateBankTxResult>;
  paymentCandidates(orgId: string, from: Date, to: Date): Promise<PaymentCandidate[]>;
  findReconciliationByTx(bankTransactionId: string): Promise<{ id: string } | null>;
  createReconciliation(
    bankTransactionId: string,
    confirmedBy: string,
    note: string | null,
  ): Promise<{ id: string }>;
  createAccount(orgId: string, code: string, name: string): Promise<AccountRow>;
  listAccounts(orgId: string): Promise<AccountRow[]>;
  findAccount(id: string, orgId: string): Promise<AccountRow | null>;
  isAccountCodeTaken(orgId: string, code: string): Promise<boolean>;
  createCategory(orgId: string, name: string): Promise<CategoryRow>;
  listCategories(orgId: string): Promise<CategoryRow[]>;
  findCategory(id: string, orgId: string): Promise<CategoryRow | null>;
  isCategoryNameTaken(orgId: string, name: string): Promise<boolean>;
  createLedgerTransaction(
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
  ): Promise<LedgerTransactionRow>;
  listLedgerTransactions(
    orgId: string,
    filter: { accountId?: string; from?: Date; to?: Date },
  ): Promise<LedgerTransactionRow[]>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
