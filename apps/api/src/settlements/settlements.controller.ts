import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard, type RequestActor } from "../auth/jwt.guard";
import { PermissionsGuard, RequirePermission } from "../auth/permissions.guard";
import { SettlementsService } from "./settlements.service";

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

function actorIdOf(req: ActorRequest): string {
  const actor = req.actor;
  if (!actor) {
    throw new ForbiddenException("Authentication required.");
  }
  return actor.userId;
}

@ApiTags("settlements")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Post("settlements")
  @RequirePermission("settlement:write")
  @ApiResponse({ status: 201, description: "Owner settlement generated (idempotent per period)." })
  generateSettlement(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, period } = body as { propertyId?: unknown; period?: unknown };
    if (typeof propertyId !== "string" || typeof period !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.settlements.generateSettlement(orgIdOf(req), actorIdOf(req), propertyId, period);
  }

  @Get("settlements/:id")
  @RequirePermission("settlement:read")
  @ApiResponse({ status: 200, description: "Settlement detail with owner lines." })
  getSettlement(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.settlements.getSettlement(id, orgIdOf(req));
  }

  @Post("settlements/:id/payout")
  @RequirePermission("settlement:write")
  @ApiResponse({
    status: 201,
    description: "Recorded payout with transfer ref (statement → receipt traceability).",
  })
  recordPayout(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { transferRef } = body as { transferRef?: unknown };
    return this.settlements.recordPayout(id, orgIdOf(req), actorIdOf(req), transferRef);
  }
}
