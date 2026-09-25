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
  writeAuditEvent(event: AuditInput): Promise<void>;
}
