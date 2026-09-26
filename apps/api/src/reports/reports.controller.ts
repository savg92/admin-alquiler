import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard, type RequestActor } from "../auth/jwt.guard";
import { PermissionsGuard, RequirePermission } from "../auth/permissions.guard";
import { ReportsService } from "./reports.service";

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

@ApiTags("reports")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("kpis")
  @RequirePermission("finance:read")
  @ApiResponse({ status: 200, description: "v1 KPI set for a YYYY-MM period." })
  kpis(@Req() req: ActorRequest, @Query("period") period?: string) {
    if (!period) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.reports.kpis(orgIdOf(req), period);
  }
}
