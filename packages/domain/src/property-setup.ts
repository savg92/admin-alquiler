export type UnitSubtype = "RESIDENTIAL" | "OFFICE" | "PARKING" | "STORAGE";

const UNIT_SUBTYPES: readonly string[] = ["RESIDENTIAL", "OFFICE", "PARKING", "STORAGE"];

export interface BulkUnitInput {
  code: string;
  subtype: string;
}

export function validateBulkUnits(units: BulkUnitInput[]): void {
  if (units.length === 0) {
    throw new Error("At least one unit is required.");
  }
  const seen = new Set<string>();
  for (const unit of units) {
    const code = unit.code.trim();
    if (code.length === 0) {
      throw new Error("Unit codes must not be empty.");
    }
    if (seen.has(code)) {
      throw new Error(`Duplicate unit code "${code}".`);
    }
    seen.add(code);
    if (!UNIT_SUBTYPES.includes(unit.subtype)) {
      throw new Error(`Invalid unit subtype "${unit.subtype}".`);
    }
  }
}

export interface OwnershipShareInput {
  ownerId: string;
  sharePct: number;
}

export function validateOwnershipShares(shares: OwnershipShareInput[]): void {
  if (shares.length === 0) {
    throw new Error("At least one owner share is required.");
  }
  let total = 0;
  for (const share of shares) {
    if (!(share.sharePct > 0) || share.sharePct > 100) {
      throw new Error("Each ownership share must be greater than 0 and at most 100.");
    }
    total += share.sharePct;
  }
  if (Math.abs(total - 100) > 1e-9) {
    throw new Error(`Ownership shares must total 100 (got ${total}).`);
  }
}

export interface TenancyPeriod {
  startDate: string;
  endDate: string | null;
}

function toTime(value: string): number {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(`Invalid date "${value}".`);
  }
  return time;
}

export function tenancyPeriodsOverlap(a: TenancyPeriod, b: TenancyPeriod): boolean {
  const aStart = toTime(a.startDate);
  const aEnd = a.endDate === null ? Number.POSITIVE_INFINITY : toTime(a.endDate);
  const bStart = toTime(b.startDate);
  const bEnd = b.endDate === null ? Number.POSITIVE_INFINITY : toTime(b.endDate);
  return aStart <= bEnd && bStart <= aEnd;
}

export interface SetupStatusInput {
  unitCount: number;
  ownershipTotalPct: number;
  tenancyCount: number;
}

export interface SetupChecklist {
  details: boolean;
  units: boolean;
  owners: boolean;
  tenants: boolean;
  complete: boolean;
}

export function setupChecklist(input: SetupStatusInput): SetupChecklist {
  const checklist: SetupChecklist = {
    details: true,
    units: input.unitCount > 0,
    owners: Math.abs(input.ownershipTotalPct - 100) < 1e-9,
    tenants: input.tenancyCount > 0,
    complete: false,
  };
  checklist.complete =
    checklist.details && checklist.units && checklist.owners && checklist.tenants;
  return checklist;
}
