export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface ActorContext {
  userId: string;
  orgId: string;
  membershipStatus: MembershipStatus;
  permissions: string[];
}

export interface ResourceScope {
  orgId: string;
}

export type DenyReason = "unauthenticated" | "membership" | "isolation" | "permission";

export type AuthDecision = { allowed: true } | { allowed: false; reason: DenyReason };

export function authorize(
  actor: ActorContext | null | undefined,
  required: string,
  resource: ResourceScope,
): AuthDecision {
  if (!actor) {
    return { allowed: false, reason: "unauthenticated" };
  }
  if (actor.membershipStatus !== "ACTIVE") {
    return { allowed: false, reason: "membership" };
  }
  if (actor.orgId !== resource.orgId) {
    return { allowed: false, reason: "isolation" };
  }
  if (!actor.permissions.includes(required)) {
    return { allowed: false, reason: "permission" };
  }
  return { allowed: true };
}
