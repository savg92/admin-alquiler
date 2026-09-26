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
import { DirectoryService } from "./directory.service";

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

@ApiTags("directory")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Post("suppliers")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Supplier directory entry (no accounts)." })
  createSupplier(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { name, category, contact, taxId, address, notes } = body as Record<string, unknown>;
    if (typeof name !== "string" || typeof category !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    for (const field of [contact, taxId, address, notes]) {
      if (field !== undefined && field !== null && typeof field !== "string") {
        throw new ForbiddenException("Invalid request.");
      }
    }
    return this.directory.createSupplier(orgIdOf(req), actorIdOf(req), {
      name,
      category,
      ...(typeof contact === "string" ? { contact } : {}),
      ...(typeof taxId === "string" ? { taxId } : {}),
      ...(typeof address === "string" ? { address } : {}),
      ...(typeof notes === "string" ? { notes } : {}),
    });
  }

  @Get("suppliers")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Supplier directory." })
  listSuppliers(@Req() req: ActorRequest) {
    return this.directory.listSuppliers(orgIdOf(req));
  }

  @Post("purchases")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Purchase-place tracking per property." })
  createPurchase(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, supplierId, place, description, amount, currency, date, receiptRef } =
      body as Record<string, unknown>;
    if (
      typeof propertyId !== "string" ||
      typeof description !== "string" ||
      typeof amount !== "number" ||
      typeof currency !== "string" ||
      typeof date !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (supplierId !== undefined && typeof supplierId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (place !== undefined && place !== null && typeof place !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (receiptRef !== undefined && receiptRef !== null && typeof receiptRef !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.directory.createPurchase(orgIdOf(req), actorIdOf(req), {
      propertyId,
      description,
      amount,
      currency,
      date,
      ...(typeof supplierId === "string" ? { supplierId } : {}),
      ...(typeof place === "string" ? { place } : {}),
      ...(typeof receiptRef === "string" ? { receiptRef } : {}),
    });
  }

  @Get("purchases")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Purchases, optionally per property." })
  listPurchases(@Req() req: ActorRequest, @Query("propertyId") propertyId?: string) {
    return propertyId === undefined
      ? this.directory.listPurchases(orgIdOf(req))
      : this.directory.listPurchases(orgIdOf(req), propertyId);
  }

  @Post("insurance")
  @RequirePermission("property:write")
  @ApiResponse({ status: 201, description: "Insurance record with optional contract link." })
  createInsurance(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, contractId, provider, policyRef, validFrom, validUntil } = body as Record<
      string,
      unknown
    >;
    if (
      typeof provider !== "string" ||
      typeof policyRef !== "string" ||
      typeof validFrom !== "string" ||
      typeof validUntil !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (propertyId !== undefined && typeof propertyId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (contractId !== undefined && typeof contractId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.directory.createInsurance(orgIdOf(req), actorIdOf(req), {
      provider,
      policyRef,
      validFrom,
      validUntil,
      ...(typeof propertyId === "string" ? { propertyId } : {}),
      ...(typeof contractId === "string" ? { contractId } : {}),
    });
  }

  @Get("insurance")
  @RequirePermission("property:read")
  @ApiResponse({ status: 200, description: "Insurance records." })
  listInsurance(@Req() req: ActorRequest, @Query("propertyId") propertyId?: string) {
    return propertyId === undefined
      ? this.directory.listInsurance(orgIdOf(req))
      : this.directory.listInsurance(orgIdOf(req), propertyId);
  }

  @Post("maintenance-requests/:requestId/work-orders/:id/assign")
  @RequirePermission("maintenance:write")
  @ApiResponse({ status: 201, description: "Assign a supplier to a work order." })
  assignSupplier(
    @Req() req: ActorRequest,
    @Param("requestId") requestId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { supplierId } = body as { supplierId?: unknown };
    if (typeof supplierId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.directory.assignSupplierToWorkOrder(
      orgIdOf(req),
      actorIdOf(req),
      requestId,
      id,
      supplierId,
    );
  }
}
