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
import { GovernanceService } from "./governance.service";

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

@ApiTags("governance")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Post("assembly-acts")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Assembly act with quorum computation." })
  createAct(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, heldAt, attendance } = body as Record<string, unknown>;
    if (
      typeof propertyId !== "string" ||
      typeof heldAt !== "string" ||
      !Array.isArray(attendance)
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.governance.createAssemblyAct(orgIdOf(req), actorIdOf(req), {
      propertyId,
      heldAt,
      attendance: attendance as { ownerId: string; sharePct: number; proxyTo?: string | null }[],
    });
  }

  @Get("assembly-acts")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Assembly acts per property." })
  listActs(@Req() req: ActorRequest, @Query("propertyId") propertyId?: string) {
    if (!propertyId) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.governance.listAssemblyActs(propertyId, orgIdOf(req));
  }

  @Post("assembly-acts/:id/decisions")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Decision with majority rule." })
  createDecision(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { title, description, majority } = body as Record<string, unknown>;
    if (typeof title !== "string" || typeof majority !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (description !== undefined && description !== null && typeof description !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.governance.createDecision(
      orgIdOf(req),
      actorIdOf(req),
      id,
      typeof description === "string" ? { title, description, majority } : { title, majority },
    );
  }

  @Get("assembly-acts/:id/decisions")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Decisions of an act." })
  listDecisions(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.governance.listDecisions(id, orgIdOf(req));
  }

  @Post("assembly-acts/:actId/decisions/:decisionId/votes")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Ownership-weighted vote." })
  recordVote(
    @Req() req: ActorRequest,
    @Param("actId") actId: string,
    @Param("decisionId") decisionId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { ownerId, weight, choice } = body as Record<string, unknown>;
    if (typeof weight !== "number" || typeof choice !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (ownerId !== undefined && typeof ownerId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.governance.recordVote(
      orgIdOf(req),
      actorIdOf(req),
      actId,
      decisionId,
      typeof ownerId === "string" ? { ownerId, weight, choice } : { weight, choice },
    );
  }

  @Get("assembly-acts/:actId/decisions/:decisionId/result")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Decision outcome under its majority rule." })
  decisionResult(
    @Req() req: ActorRequest,
    @Param("actId") actId: string,
    @Param("decisionId") decisionId: string,
  ) {
    return this.governance.decisionResult(actId, decisionId, orgIdOf(req));
  }

  @Post("owner-authorizations/evaluate")
  @RequirePermission("property:read")
  @ApiResponse({ status: 201, description: "Evaluate an owner authorization rule." })
  evaluateAuthorization(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, mode, percentage, approvals } = body as Record<string, unknown>;
    if (typeof propertyId !== "string" || typeof mode !== "string" || !Array.isArray(approvals)) {
      throw new ForbiddenException("Invalid request.");
    }
    if (percentage !== undefined && typeof percentage !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.governance.evaluateOwnerAuthorization(
      orgIdOf(req),
      propertyId,
      percentage === undefined
        ? { mode, approvals: approvals as string[] }
        : { mode, percentage, approvals: approvals as string[] },
    );
  }

  @Post("ph-cuotas")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "PH cuota (property-flag gated)." })
  createPhCuota(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, type, amount, currency, dueDate, assemblyActId } = body as Record<
      string,
      unknown
    >;
    if (
      typeof propertyId !== "string" ||
      typeof type !== "string" ||
      typeof amount !== "number" ||
      typeof dueDate !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (currency !== undefined && typeof currency !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (assemblyActId !== undefined && typeof assemblyActId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.governance.createPhCuota(orgIdOf(req), actorIdOf(req), {
      propertyId,
      type,
      amount,
      dueDate,
      ...(typeof currency === "string" ? { currency } : {}),
      ...(typeof assemblyActId === "string" ? { assemblyActId } : {}),
    });
  }

  @Get("ph-cuotas")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "PH cuotas per property." })
  listPhCuotas(@Req() req: ActorRequest, @Query("propertyId") propertyId?: string) {
    if (!propertyId) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.governance.listPhCuotas(propertyId, orgIdOf(req));
  }

  @Post("ph-cuotas/:id/bill")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Bill a PH cuota as a contract charge." })
  billPhCuota(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { contractId, period } = body as Record<string, unknown>;
    if (typeof contractId !== "string" || typeof period !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.governance.billPhCuota(orgIdOf(req), actorIdOf(req), id, { contractId, period });
  }
}
