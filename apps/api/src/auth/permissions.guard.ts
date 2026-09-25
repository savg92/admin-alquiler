import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { authorize } from "@admin-alquiler/permissions";
import type { RequestActor } from "./jwt.guard";

export const REQUIRED_PERMISSION_KEY = "requiredPermission";

export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);

interface OrgScopedRequest {
  actor?: RequestActor;
  headers?: Record<string, string | string[] | undefined>;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required: unknown = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, context.getHandler());
    if (typeof required !== "string") {
      return true;
    }
    const request = context.switchToHttp().getRequest() as OrgScopedRequest;
    const actor = request.actor;
    if (!actor) {
      return false;
    }
    const orgHeader = request.headers?.["x-org-id"];
    const orgId = Array.isArray(orgHeader) ? orgHeader[0] : orgHeader;
    if (!orgId) {
      return false;
    }
    const membership = actor.memberships.find((entry) => entry.orgId === orgId);
    if (!membership) {
      return false;
    }
    const decision = authorize(
      {
        userId: actor.userId,
        orgId: membership.orgId,
        membershipStatus: membership.status,
        permissions: membership.permissions,
      },
      required,
      { orgId },
    );
    return decision.allowed;
  }
}
