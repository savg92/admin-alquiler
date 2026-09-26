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
