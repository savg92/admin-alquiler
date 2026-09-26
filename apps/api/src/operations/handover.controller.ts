import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard, type RequestActor } from "../auth/jwt.guard";
import { PermissionsGuard, RequirePermission } from "../auth/permissions.guard";
import { HandoverService } from "./handover.service";

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

@ApiTags("handovers")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HandoverController {
  constructor(private readonly handovers: HandoverService) {}

  @Post("handovers")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Handover with evidence, document and deposit quote." })
  record(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, unitId, contractId, kind, notes, evidence, depositDeduction } =
      body as Record<string, unknown>;
    if (typeof propertyId !== "string" || typeof kind !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (unitId !== undefined && typeof unitId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (contractId !== undefined && typeof contractId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (evidence !== undefined && evidence !== null && typeof evidence !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    if (depositDeduction !== undefined && depositDeduction !== null) {
      if (typeof depositDeduction !== "object") {
        throw new ForbiddenException("Invalid request.");
      }
      const { depositId, amount } = depositDeduction as Record<string, unknown>;
      if (typeof depositId !== "string" || typeof amount !== "number") {
        throw new ForbiddenException("Invalid request.");
      }
    }
    return this.handovers.recordHandover(orgIdOf(req), actorIdOf(req), {
      propertyId,
      kind,
      ...(typeof unitId === "string" ? { unitId } : {}),
      ...(typeof contractId === "string" ? { contractId } : {}),
      ...(typeof notes === "string" ? { notes } : {}),
      ...(evidence !== undefined && evidence !== null && typeof evidence === "object"
        ? { evidence: evidence as Record<string, unknown> }
        : {}),
      ...(depositDeduction !== undefined &&
      depositDeduction !== null &&
      typeof depositDeduction === "object"
        ? {
            depositDeduction: {
              depositId: (depositDeduction as { depositId: string }).depositId,
              amount: (depositDeduction as { amount: number }).amount,
            },
          }
        : {}),
    });
  }

  @Get("handovers")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Handovers, optionally per property." })
  list(@Req() req: ActorRequest, @Query("propertyId") propertyId?: string) {
    return propertyId === undefined
      ? this.handovers.listHandovers(orgIdOf(req))
      : this.handovers.listHandovers(orgIdOf(req), propertyId);
  }

  @Get("handovers/:id")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Handover detail." })
  get(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.handovers.getHandover(id, orgIdOf(req));
  }
}
