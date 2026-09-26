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
import { MaintenanceService } from "./maintenance.service";

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

@ApiTags("maintenance")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Post("maintenance-requests")
  @RequirePermission("maintenance:write")
  @ApiResponse({ status: 201, description: "Maintenance request created." })
  createRequest(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, unitId, title, description, priority } = body as {
      propertyId?: unknown;
      unitId?: unknown;
      title?: unknown;
      description?: unknown;
      priority?: unknown;
    };
    if (
      typeof propertyId !== "string" ||
      typeof title !== "string" ||
      typeof description !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (unitId !== undefined && unitId !== null && typeof unitId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (priority !== undefined && typeof priority !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.maintenance.createRequest(orgIdOf(req), actorIdOf(req), {
      propertyId,
      title,
      description,
      ...(typeof unitId === "string" ? { unitId } : {}),
      ...(typeof priority === "string" ? { priority } : {}),
    });
  }

  @Get("maintenance-requests")
  @RequirePermission("maintenance:read")
  @ApiResponse({ status: 200, description: "Maintenance requests, optionally per property." })
  listRequests(@Req() req: ActorRequest, @Query("propertyId") propertyId?: string) {
    return propertyId === undefined
      ? this.maintenance.listRequests(orgIdOf(req))
      : this.maintenance.listRequests(orgIdOf(req), propertyId);
  }

  @Post("maintenance-requests/:id/transitions")
  @RequirePermission("maintenance:write")
  @ApiResponse({ status: 201, description: "Maintenance status transition." })
  transition(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { to } = body as { to?: unknown };
    if (typeof to !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.maintenance.transitionRequest(orgIdOf(req), actorIdOf(req), id, to);
  }

  @Post("maintenance-requests/:id/work-orders")
  @RequirePermission("maintenance:write")
  @ApiResponse({ status: 201, description: "Work order created with evidence-ready costs." })
  createWorkOrder(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    const input: { supplierId?: string; cost?: number; currency?: string } = {};
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      const { supplierId, cost, currency } = body as {
        supplierId?: unknown;
        cost?: unknown;
        currency?: unknown;
      };
      if (supplierId !== undefined && typeof supplierId !== "string") {
        throw new ForbiddenException("Invalid request.");
      }
      if (cost !== undefined && typeof cost !== "number") {
        throw new ForbiddenException("Invalid request.");
      }
      if (currency !== undefined && typeof currency !== "string") {
        throw new ForbiddenException("Invalid request.");
      }
      if (typeof supplierId === "string") {
        input.supplierId = supplierId;
      }
      if (typeof cost === "number") {
        input.cost = cost;
      }
      if (typeof currency === "string") {
        input.currency = currency;
      }
    }
    return this.maintenance.createWorkOrder(orgIdOf(req), actorIdOf(req), id, input);
  }

  @Get("maintenance-requests/:id/work-orders")
  @RequirePermission("maintenance:read")
  @ApiResponse({ status: 200, description: "Work orders with status history via audit." })
  listWorkOrders(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.maintenance.listWorkOrders(id, orgIdOf(req));
  }

  @Post("maintenance-requests/:requestId/work-orders/:id/transitions")
  @RequirePermission("maintenance:write")
  @ApiResponse({ status: 201, description: "Work order status transition." })
  transitionWorkOrder(
    @Req() req: ActorRequest,
    @Param("requestId") requestId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { to } = body as { to?: unknown };
    if (typeof to !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.maintenance.transitionWorkOrder(orgIdOf(req), actorIdOf(req), requestId, id, to);
  }
}
