export interface ContractTermsInput {
  startDate: string;
  endDate: string;
  rentAmountMinor: number;
}

export function validateContractTerms(input: ContractTermsInput): void {
  const start = Date.parse(input.startDate);
  const end = Date.parse(input.endDate);
  if (Number.isNaN(start)) {
    throw new Error('Invalid date "startDate".');
  }
  if (Number.isNaN(end)) {
    throw new Error('Invalid date "endDate".');
  }
  if (end <= start) {
    throw new Error("Contract endDate must be after startDate.");
  }
  if (!Number.isInteger(input.rentAmountMinor) || input.rentAmountMinor <= 0) {
    throw new Error("rentAmountMinor must be a positive integer of minor units.");
  }
}

export function periodKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function periodDueDate(period: string, day = 5): Date {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`Invalid period "${period}". Expected "YYYY-MM".`);
  }
  const [year, month] = period.split("-").map(Number);
  if (month === undefined || month < 1 || month > 12 || year === undefined) {
    throw new Error(`Invalid period "${period}". Expected "YYYY-MM".`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

export interface ChargeBalance {
  id: string;
  balanceMinor: number;
  dueDate: string;
}

export interface PaymentAllocation {
  chargeId: string;
  amountMinor: number;
}

export interface AllocationResult {
  allocations: PaymentAllocation[];
  remainderMinor: number;
}

export function allocatePayment(charges: ChargeBalance[], paymentMinor: number): AllocationResult {
  if (!Number.isInteger(paymentMinor) || paymentMinor <= 0) {
    throw new Error("paymentMinor must be a positive integer of minor units.");
  }
  const ordered = [...charges]
    .filter((charge) => charge.balanceMinor > 0)
    .sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate));
  const allocations: PaymentAllocation[] = [];
  let remaining = paymentMinor;
  for (const charge of ordered) {
    if (remaining <= 0) {
      break;
    }
    const amount = Math.min(charge.balanceMinor, remaining);
    allocations.push({ chargeId: charge.id, amountMinor: amount });
    remaining -= amount;
  }
  return { allocations, remainderMinor: remaining };
}

export type ChargePaymentStatus = "PENDING" | "PARTIAL" | "PAID";

export function chargePaymentStatus(balanceMinor: number, paidMinor: number): ChargePaymentStatus {
  if (paidMinor <= 0) {
    return "PENDING";
  }
  return paidMinor >= balanceMinor ? "PAID" : "PARTIAL";
}
