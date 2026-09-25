export const PERMISSION_KEYS = [
  "property:read",
  "property:write",
  "contract:read",
  "contract:write",
  "payment:read",
  "payment:write",
  "document:read",
  "document:write",
  "document:approve",
  "member:read",
  "member:write",
  "role:write",
  "owner:read",
  "report:read",
  "settlement:read",
  "settlement:write",
  "finance:read",
  "finance:write",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}
