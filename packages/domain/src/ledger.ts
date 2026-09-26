export interface AccountInput {
  code: string;
  name: string;
}

export function validateAccount(input: AccountInput): void {
  if (input.code.trim().length === 0 || input.code.trim().length > 32) {
    throw new Error("Account code is required (max 32 characters).");
  }
  if (input.name.trim().length === 0 || input.name.trim().length > 120) {
    throw new Error("Account name is required (max 120 characters).");
  }
}

export function validateCategoryName(name: string): void {
  if (name.trim().length === 0 || name.trim().length > 120) {
    throw new Error("Category name is required (max 120 characters).");
  }
}

export interface LedgerTransactionInput {
  amount: number;
  currency: string;
  source: string;
  occurredAt: string;
}

const ISO_CURRENCIES = new Set([
  "COP",
  "USD",
  "EUR",
  "MXN",
  "PEN",
  "CLP",
  "ARS",
  "BRL",
  "GBP",
  "CAD",
]);

export function validateLedgerTransaction(input: LedgerTransactionInput): number {
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount === 0) {
    throw new Error("Transaction amount must be a non-zero number.");
  }
  if (typeof input.currency !== "string" || !ISO_CURRENCIES.has(input.currency.toUpperCase())) {
    throw new Error(`Unsupported currency "${String(input.currency)}".`);
  }
  if (typeof input.source !== "string" || input.source.trim().length === 0) {
    throw new Error("Transaction source is required.");
  }
  if (typeof input.occurredAt !== "string" || Number.isNaN(Date.parse(input.occurredAt))) {
    throw new Error('Invalid date "occurredAt".');
  }
  return Math.round(input.amount * 100);
}
