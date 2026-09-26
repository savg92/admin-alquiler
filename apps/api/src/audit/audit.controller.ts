import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard, type RequestActor } from "../auth/jwt.guard";
import { PermissionsGuard, RequirePermission } from "../auth/permissions.guard";
import { AuditService } from "./audit.service";

interface ActorRequest extends Request {
  actor?: RequestActor;
}

function orgIdOf(req: ActorRequest): string {
  const value = req.headers["x-org-id"];
  const orgId = Array.isArray(value) ? value[0] : value;
  if (!orgId) {
    throw new ForbiddenException("Organization scope required.");
  }
  return orgId;
}

@ApiTags("audit")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get("audit-events")
  @RequirePermission("report:read")
  @ApiResponse({ status: 200, description: "Organization audit trail with optional filters." })
  listEvents(
    @Req() req: ActorRequest,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("action") action?: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = limit === undefined ? undefined : Number.parseInt(limit, 10);
    if (limit !== undefined && !Number.isInteger(parsed)) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.audit.listEvents(
      orgIdOf(req),
      parsed === undefined
        ? {
            ...(entityType === undefined ? {} : { entityType }),
            ...(entityId === undefined ? {} : { entityId }),
            ...(action === undefined ? {} : { action }),
          }
        : {
            ...(entityType === undefined ? {} : { entityType }),
            ...(entityId === undefined ? {} : { entityId }),
            ...(action === undefined ? {} : { action }),
            limit: parsed,
          },
    );
  }
}
