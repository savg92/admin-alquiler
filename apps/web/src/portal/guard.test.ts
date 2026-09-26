import { describe, expect, test } from "bun:test";
import { hasAllPermissions, missingPermissions } from "./guard";

const memberships = [
  { orgId: "org-1", roleName: "tenant", permissions: ["contract:write", "maintenance:read"] },
];

describe("portal guards", () => {
  test("grants when every required permission is present", () => {
    expect(hasAllPermissions(memberships, ["contract:write"])).toBe(true);
    expect(hasAllPermissions(memberships, ["contract:write", "maintenance:read"])).toBe(true);
  });

  test("denies and lists what is missing", () => {
    expect(hasAllPermissions(memberships, ["finance:read"])).toBe(false);
    expect(missingPermissions(memberships, ["finance:read", "contract:write"])).toEqual([
      "finance:read",
    ]);
  });
});
