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
import { PropertiesService } from "./properties.service";

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

@ApiTags("properties")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Post("properties")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Property created with bulk units." })
  createProperty(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { name, address, city, phEnabled, units } = body as {
      name?: unknown;
      address?: unknown;
      city?: unknown;
      phEnabled?: unknown;
      units?: unknown;
    };
    if (typeof name !== "string" || typeof address !== "string" || typeof city !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (!Array.isArray(units)) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.properties.createPropertyWithUnits(orgIdOf(req), actorIdOf(req), {
      name,
      address,
      city,
      phEnabled: phEnabled === true,
      units: units as { code: string; subtype: string; areaM2?: number }[],
    });
  }

  @Get("properties")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Organization properties." })
  listProperties(@Req() req: ActorRequest) {
    return this.properties.listProperties(orgIdOf(req));
  }

  @Get("properties/:id")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Property detail with units." })
  getProperty(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.properties.getProperty(id, orgIdOf(req));
  }

  @Get("properties/:id/setup")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Guided setup checklist and resumable progress." })
  setupStatus(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.properties.setupStatus(id, orgIdOf(req));
  }

  @Post("owners")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Owner created with ownership share." })
  addOwner(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, name, taxId, sharePct, startDate } = body as {
      propertyId?: unknown;
      name?: unknown;
      taxId?: unknown;
      sharePct?: unknown;
      startDate?: unknown;
    };
    if (
      typeof propertyId !== "string" ||
      typeof name !== "string" ||
      typeof sharePct !== "number"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.properties.addOwnerWithShare(orgIdOf(req), actorIdOf(req), propertyId, {
      name,
      taxId: typeof taxId === "string" ? taxId : undefined,
      sharePct,
      startDate: typeof startDate === "string" ? startDate : "",
    });
  }

  @Post("tenants")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Tenant created with tenancy period." })
  addTenant(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, unitId, name, startDate, endDate } = body as {
      propertyId?: unknown;
      unitId?: unknown;
      name?: unknown;
      startDate?: unknown;
      endDate?: unknown;
    };
    if (typeof propertyId !== "string" || typeof name !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.properties.addTenantWithTenancy(orgIdOf(req), actorIdOf(req), propertyId, {
      name,
      unitId: typeof unitId === "string" ? unitId : undefined,
      startDate: typeof startDate === "string" ? startDate : "",
      endDate: typeof endDate === "string" ? endDate : undefined,
    });
  }
}
