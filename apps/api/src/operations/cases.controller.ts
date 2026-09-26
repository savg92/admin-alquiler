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
import { CasesService } from "./cases.service";

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

@ApiTags("cases")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post("complaints")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Complaint created." })
  createComplaint(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, reporter, subject, body: text } = body as Record<string, unknown>;
    if (
      typeof propertyId !== "string" ||
      typeof reporter !== "string" ||
      typeof subject !== "string" ||
      typeof text !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.cases.createComplaint(orgIdOf(req), actorIdOf(req), {
      propertyId,
      reporter,
      subject,
      body: text,
    });
  }

  @Get("complaints")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Complaints with configurable workflow states." })
  listComplaints(@Req() req: ActorRequest, @Query("propertyId") propertyId?: string) {
    return propertyId === undefined
      ? this.cases.listComplaints(orgIdOf(req))
      : this.cases.listComplaints(orgIdOf(req), propertyId);
  }

  @Post("complaints/:id/transitions")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Complaint workflow transition." })
  transitionComplaint(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { to } = body as { to?: unknown };
    if (typeof to !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.cases.transitionComplaint(orgIdOf(req), actorIdOf(req), id, to);
  }

  @Post("claims")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Claim created." })
  createClaim(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, subject, body: text } = body as Record<string, unknown>;
    if (typeof propertyId !== "string" || typeof subject !== "string" || typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.cases.createClaim(orgIdOf(req), actorIdOf(req), {
      propertyId,
      subject,
      body: text,
    });
  }

  @Get("claims")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Claims with configurable workflow states." })
  listClaims(@Req() req: ActorRequest, @Query("propertyId") propertyId?: string) {
    return propertyId === undefined
      ? this.cases.listClaims(orgIdOf(req))
      : this.cases.listClaims(orgIdOf(req), propertyId);
  }

  @Post("claims/:id/transitions")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Claim workflow transition." })
  transitionClaim(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { to } = body as { to?: unknown };
    if (typeof to !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.cases.transitionClaim(orgIdOf(req), actorIdOf(req), id, to);
  }

  @Post("tax-records")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Tax record (record-only, no filing)." })
  createTaxRecord(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { country, label, dueDate, receiptRef } = body as Record<string, unknown>;
    if (typeof country !== "string" || typeof label !== "string" || typeof dueDate !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (receiptRef !== undefined && receiptRef !== null && typeof receiptRef !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.cases.createTaxRecord(orgIdOf(req), actorIdOf(req), {
      country,
      label,
      dueDate,
      ...(typeof receiptRef === "string" ? { receiptRef } : {}),
    });
  }

  @Get("tax-deadlines")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Country-pack tax deadline reminders." })
  upcomingDeadlines(@Req() req: ActorRequest, @Query("withinDays") withinDays?: string) {
    const parsed = withinDays === undefined ? 30 : Number.parseInt(withinDays, 10);
    if (!Number.isInteger(parsed)) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.cases.upcomingDeadlines(orgIdOf(req), parsed);
  }

  @Post("properties/:propertyId/house-rules")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Publish a versioned house rule." })
  publishHouseRule(
    @Req() req: ActorRequest,
    @Param("propertyId") propertyId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { body: text } = body as { body?: unknown };
    if (typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.cases.publishHouseRule(orgIdOf(req), actorIdOf(req), propertyId, text);
  }

  @Get("properties/:propertyId/house-rules")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Versioned house rules." })
  listHouseRules(@Req() req: ActorRequest, @Param("propertyId") propertyId: string) {
    return this.cases.listHouseRules(propertyId, orgIdOf(req));
  }
}
