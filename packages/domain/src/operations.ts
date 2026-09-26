export type MaintenanceStatus = "OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED" | "CLOSED";
export type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

const MAINTENANCE_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  OPEN: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["ON_HOLD", "RESOLVED", "CLOSED"],
  ON_HOLD: ["IN_PROGRESS", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export function canTransitionMaintenance(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  return MAINTENANCE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function parseMaintenanceStatus(value: string): MaintenanceStatus {
  const valid: MaintenanceStatus[] = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"];
  if (!valid.includes(value as MaintenanceStatus)) {
    throw new Error(`Invalid maintenance status "${value}".`);
  }
  return value as MaintenanceStatus;
}

export function parseMaintenancePriority(value: string): MaintenancePriority {
  const valid: MaintenancePriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
  if (!valid.includes(value as MaintenancePriority)) {
    throw new Error(`Invalid maintenance priority "${value}".`);
  }
  return value as MaintenancePriority;
}

export function validateMaintenanceText(title: string, description: string): void {
  if (title.trim().length === 0 || title.length > 200) {
    throw new Error("Maintenance title must be 1-200 characters.");
  }
  if (description.trim().length === 0 || description.length > 20000) {
    throw new Error("Maintenance description must be 1-20000 characters.");
  }
}

export function validateSupplierName(name: string): string {
  if (name.trim().length === 0 || name.length > 120) {
    throw new Error("Supplier name must be 1-120 characters.");
  }
  return name.trim();
}

export function validateSupplierCategory(category: string): string {
  if (category.trim().length === 0 || category.length > 80) {
    throw new Error("Supplier category must be 1-80 characters.");
  }
  return category.trim();
}

export interface PurchaseInput {
  description: string;
  amount: number;
  currency: string;
  date: string;
}

export function validatePurchase(input: PurchaseInput): number {
  if (input.description.trim().length === 0 || input.description.length > 500) {
    throw new Error("Purchase description must be 1-500 characters.");
  }
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Purchase amount must be a positive number.");
  }
  if (typeof input.currency !== "string" || input.currency.trim().length !== 3) {
    throw new Error("Purchase currency must be an ISO-4217 code.");
  }
  if (typeof input.date !== "string" || Number.isNaN(Date.parse(input.date))) {
    throw new Error('Invalid date "date".');
  }
  return Math.round(input.amount * 100);
}

export interface InsuranceInput {
  provider: string;
  policyRef: string;
  validFrom: string;
  validUntil: string;
}

export function validateInsurance(input: InsuranceInput): void {
  if (input.provider.trim().length === 0 || input.provider.length > 120) {
    throw new Error("Insurance provider must be 1-120 characters.");
  }
  if (input.policyRef.trim().length === 0 || input.policyRef.length > 120) {
    throw new Error("Insurance policy reference must be 1-120 characters.");
  }
  const from = Date.parse(input.validFrom);
  const until = Date.parse(input.validUntil);
  if (Number.isNaN(from)) {
    throw new Error('Invalid date "validFrom".');
  }
  if (Number.isNaN(until)) {
    throw new Error('Invalid date "validUntil".');
  }
  if (until < from) {
    throw new Error("Insurance validUntil must be on or after validFrom.");
  }
}
