import { describe, expect, test } from "bun:test";
import { authorize, type ActorContext } from "@admin-alquiler/permissions";

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "user-1",
    orgId: "org-a",
    membershipStatus: "ACTIVE",
    permissions: ["property:read", "property:write"],
    ...overrides,
  };
}

describe("authorization policy", () => {
  test("allows same-org actors with the required permission", () => {
    expect(authorize(actor(), "property:write", { orgId: "org-a" })).toEqual({ allowed: true });
  });

  test("denies cross-organization access even with the permission", () => {
    expect(authorize(actor(), "property:write", { orgId: "org-b" })).toEqual({
      allowed: false,
      reason: "isolation",
    });
  });

  test("denies actors missing the required permission", () => {
    expect(authorize(actor(), "payment:write", { orgId: "org-a" })).toEqual({
      allowed: false,
      reason: "permission",
    });
  });

  test("denies suspended and revoked memberships", () => {
    for (const status of ["SUSPENDED", "REVOKED"] as const) {
      expect(
        authorize(actor({ membershipStatus: status }), "property:read", { orgId: "org-a" }),
      ).toEqual({
        allowed: false,
        reason: "membership",
      });
    }
  });

  test("denies unauthenticated callers", () => {
    expect(authorize(null, "property:read", { orgId: "org-a" })).toEqual({
      allowed: false,
      reason: "unauthenticated",
    });
    expect(authorize(undefined, "property:read", { orgId: "org-a" })).toEqual({
      allowed: false,
      reason: "unauthenticated",
    });
  });

  test("deny by default: empty permission set allows nothing", () => {
    expect(authorize(actor({ permissions: [] }), "property:read", { orgId: "org-a" })).toEqual({
      allowed: false,
      reason: "permission",
    });
  });
});
