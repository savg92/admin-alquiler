export interface OccupancyInput {
  totalUnits: number;
  occupiedUnits: number;
}

export function occupancyRate(input: OccupancyInput): number {
  if (input.totalUnits <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, input.occupiedUnits / input.totalUnits));
}

export interface DelinquencyInput {
  overdueMinor: number;
  totalBilledMinor: number;
}

export function delinquencyRate(input: DelinquencyInput): number {
  if (input.totalBilledMinor <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, input.overdueMinor / input.totalBilledMinor));
}

export interface ExpiringContract {
  id: string;
  endDate: string;
}

export function upcomingExpirations(
  contracts: ExpiringContract[],
  now: number = Date.now(),
  withinDays = 90,
): ExpiringContract[] {
  const horizon = now + withinDays * 86_400_000;
  return contracts
    .filter((contract) => {
      const end = Date.parse(contract.endDate);
      return !Number.isNaN(end) && end >= now && end <= horizon;
    })
    .sort((a, b) => Date.parse(a.endDate) - Date.parse(b.endDate));
}

export interface StatementTotals {
  billedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
}

export function statementTotals(billedMinor: number, collectedMinor: number): StatementTotals {
  return {
    billedMinor,
    collectedMinor,
    outstandingMinor: Math.max(0, billedMinor - collectedMinor),
  };
}

export function validateTransferRef(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Transfer reference is required to record a payout.");
  }
  if (value.trim().length > 120) {
    throw new Error("Transfer reference must be at most 120 characters.");
  }
  return value.trim();
}

export interface MaintenanceCase {
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceSla {
  resolved: number;
  withinTarget: number;
  rate: number;
  openCases: number;
}

export function maintenanceSla(cases: MaintenanceCase[], targetDays = 7): MaintenanceSla {
  let resolved = 0;
  let withinTarget = 0;
  let openCases = 0;
  for (const item of cases) {
    const created = Date.parse(item.createdAt);
    const updated = Date.parse(item.updatedAt);
    if (Number.isNaN(created) || Number.isNaN(updated)) {
      continue;
    }
    if (item.status === "RESOLVED" || item.status === "CLOSED") {
      resolved += 1;
      if (updated - created <= targetDays * 86_400_000) {
        withinTarget += 1;
      }
    } else {
      openCases += 1;
    }
  }
  return {
    resolved,
    withinTarget,
    rate: resolved === 0 ? 0 : withinTarget / resolved,
    openCases,
  };
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

export function validateCurrencyCode(value: unknown): string {
  if (typeof value !== "string" || !ISO_CURRENCIES.has(value.toUpperCase())) {
    throw new Error(`Unsupported currency "${String(value)}".`);
  }
  return value.toUpperCase();
}
