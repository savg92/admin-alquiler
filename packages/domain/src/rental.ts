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

export interface CodeudorTermsInput {
  name: string;
  validFrom: string;
  validUntil?: string | null;
}

export function validateCodeudorTerms(input: CodeudorTermsInput): void {
  if (input.name.trim().length === 0) {
    throw new Error("Codeudor name is required.");
  }
  const from = Date.parse(input.validFrom);
  if (Number.isNaN(from)) {
    throw new Error('Invalid date "validFrom".');
  }
  if (input.validUntil !== undefined && input.validUntil !== null) {
    const until = Date.parse(input.validUntil);
    if (Number.isNaN(until)) {
      throw new Error('Invalid date "validUntil".');
    }
    if (until < from) {
      throw new Error("Codeudor validUntil must be on or after validFrom.");
    }
  }
}

export interface PolicyExpiry {
  id: string;
  validUntil: string | null;
}

export function expiringPolicies(
  policies: PolicyExpiry[],
  now: number = Date.now(),
  withinDays = 30,
): PolicyExpiry[] {
  const horizon = now + withinDays * 86_400_000;
  return policies
    .filter((policy) => {
      if (!policy.validUntil) {
        return false;
      }
      const end = Date.parse(policy.validUntil);
      return !Number.isNaN(end) && end >= now && end <= horizon;
    })
    .sort((a, b) => Date.parse(a.validUntil as string) - Date.parse(b.validUntil as string));
}

export type RenewalStage = 90 | 60 | 30 | 0;

export function renewalStage(daysRemaining: number): RenewalStage {
  if (daysRemaining <= 30) {
    return 30;
  }
  if (daysRemaining <= 60) {
    return 60;
  }
  if (daysRemaining <= 90) {
    return 90;
  }
  return 0;
}

export interface RenewalTermsInput {
  currentEndDate: string;
  newEndDate: string;
  rentAmountMinor?: number;
}

export function validateRenewalTerms(input: RenewalTermsInput): void {
  const current = Date.parse(input.currentEndDate);
  const next = Date.parse(input.newEndDate);
  if (Number.isNaN(current)) {
    throw new Error('Invalid date "currentEndDate".');
  }
  if (Number.isNaN(next)) {
    throw new Error('Invalid date "newEndDate".');
  }
  if (next <= current) {
    throw new Error("Renewal newEndDate must be after the current endDate.");
  }
  if (input.rentAmountMinor !== undefined) {
    if (!Number.isInteger(input.rentAmountMinor) || input.rentAmountMinor <= 0) {
      throw new Error("rentAmountMinor must be a positive integer of minor units.");
    }
  }
}

export interface TerminationInput {
  noticeDate: string;
  effectiveDate: string;
  cause: string;
}

export function validateTermination(input: TerminationInput): void {
  const notice = Date.parse(input.noticeDate);
  const effective = Date.parse(input.effectiveDate);
  if (Number.isNaN(notice)) {
    throw new Error('Invalid date "noticeDate".');
  }
  if (Number.isNaN(effective)) {
    throw new Error('Invalid date "effectiveDate".');
  }
  if (effective < notice) {
    throw new Error("Termination effectiveDate must be on or after noticeDate.");
  }
  if (input.cause.trim().length < 3) {
    throw new Error("Termination cause is required.");
  }
}

export type IndemnityRuleId = "CO_EARLY_TERMINATION_DEFAULT" | "GENERIC_NO_INDEMNITY";

export interface IndemnityQuote {
  ruleId: IndemnityRuleId;
  amountMinor: number;
  description: string;
}

export function quoteIndemnity(
  ruleId: IndemnityRuleId,
  rentAmountMinor: number,
  monthsRemaining: number,
): IndemnityQuote {
  if (!Number.isInteger(rentAmountMinor) || rentAmountMinor <= 0) {
    throw new Error("rentAmountMinor must be a positive integer of minor units.");
  }
  if (!Number.isInteger(monthsRemaining) || monthsRemaining < 0) {
    throw new Error("monthsRemaining must be a non-negative integer.");
  }
  if (ruleId === "GENERIC_NO_INDEMNITY") {
    return { ruleId, amountMinor: 0, description: "No indemnity under generic rule." };
  }
  const capped = Math.min(monthsRemaining, 3);
  return {
    ruleId,
    amountMinor: capped * rentAmountMinor,
    description: `Colombia default: ${capped} canon(es) as indemnity.`,
  };
}

export function validateIndexValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -50 || value > 100) {
    throw new Error("Index value must be a percentage between -50 and 100.");
  }
  return value;
}

export function applyIndexIncrease(
  rentAmountMinor: number,
  indexPct: number,
  capPct?: number,
): number {
  if (!Number.isInteger(rentAmountMinor) || rentAmountMinor <= 0) {
    throw new Error("rentAmountMinor must be a positive integer of minor units.");
  }
  validateIndexValue(indexPct);
  const effective = capPct === undefined ? indexPct : Math.min(indexPct, capPct);
  if (capPct !== undefined) {
    validateIndexValue(capPct);
  }
  return Math.round(rentAmountMinor * (1 + effective / 100));
}

export interface ScheduleEntry {
  period: string;
  dueDate: string;
  amountMinor: number;
}

export function buildRentSchedule(
  startPeriod: string,
  months: number,
  rentAmountMinor: number,
): ScheduleEntry[] {
  if (!/^\d{4}-\d{2}$/.test(startPeriod)) {
    throw new Error(`Invalid period "${startPeriod}". Expected "YYYY-MM".`);
  }
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    throw new Error("months must be an integer between 1 and 60.");
  }
  if (!Number.isInteger(rentAmountMinor) || rentAmountMinor <= 0) {
    throw new Error("rentAmountMinor must be a positive integer of minor units.");
  }
  const [y, m] = startPeriod.split("-").map(Number) as [number, number];
  const entries: ScheduleEntry[] = [];
  for (let i = 0; i < months; i++) {
    const date = new Date(Date.UTC(y, m - 1 + i, 1));
    const period = periodKey(date);
    entries.push({
      period,
      dueDate: periodDueDate(period).toISOString().slice(0, 10),
      amountMinor: rentAmountMinor,
    });
  }
  return entries;
}
