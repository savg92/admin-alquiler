import type { Membership } from "../auth/session";

export function hasAllPermissions(memberships: Membership[], required: string[]): boolean {
  const granted = new Set(memberships.flatMap((entry) => entry.permissions));
  return required.every((permission) => granted.has(permission));
}

export function missingPermissions(memberships: Membership[], required: string[]): string[] {
  const granted = new Set(memberships.flatMap((entry) => entry.permissions));
  return required.filter((permission) => !granted.has(permission));
}
