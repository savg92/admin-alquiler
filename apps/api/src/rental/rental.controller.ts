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
import { RentalService } from "./rental.service";

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

@ApiTags("rental")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RentalController {
  constructor(private readonly rental: RentalService) {}

  @Post("contracts")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Contract created." })
  createContract(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { propertyId, tenantId, number, startDate, endDate, rentAmount } = body as {
      propertyId?: unknown;
      tenantId?: unknown;
      number?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      rentAmount?: unknown;
    };
    if (
      typeof propertyId !== "string" ||
      typeof tenantId !== "string" ||
      typeof number !== "string" ||
      typeof startDate !== "string" ||
      typeof endDate !== "string" ||
      typeof rentAmount !== "number"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.createContract(orgIdOf(req), actorIdOf(req), {
      propertyId,
      tenantId,
      number,
      startDate,
      endDate,
      rentAmount,
    });
  }

  @Get("contracts")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Organization contracts." })
  listContracts(@Req() req: ActorRequest) {
    return this.rental.listContracts(orgIdOf(req));
  }

  @Get("contracts/:id")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Contract detail." })
  getContract(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.rental.getContract(id, orgIdOf(req));
  }

  @Post("contracts/:id/charges:generate")
  @RequirePermission("contract:write")
  @ApiResponse({
    status: 201,
    description: "Monthly rent charge generated (idempotent per period).",
  })
  generateCharge(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { period } = body as { period?: unknown };
    if (typeof period !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.generateMonthlyCharge(orgIdOf(req), actorIdOf(req), id, period);
  }

  @Get("contracts/:id/charges")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Pending charge balances." })
  listCharges(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.rental.listCharges(id, orgIdOf(req));
  }

  @Post("contracts/:id/payments")
  @RequirePermission("payment:write")
  @ApiResponse({ status: 201, description: "Payment recorded with allocation and receipt." })
  recordPayment(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { amount, method, reference, paidAt } = body as {
      amount?: unknown;
      method?: unknown;
      reference?: unknown;
      paidAt?: unknown;
    };
    if (typeof amount !== "number" || typeof method !== "string" || typeof paidAt !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.recordPayment(orgIdOf(req), actorIdOf(req), id, {
      amount,
      method,
      reference: typeof reference === "string" ? reference : undefined,
      paidAt,
    });
  }

  @Get("receipts/:id")
  @RequirePermission("payment:read")
  @ApiResponse({ status: 200, description: "Receipt detail." })
  getReceipt(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.rental.getReceipt(id, orgIdOf(req));
  }

  @Post("contracts/:id/codeudores")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Codeudor linked to contract." })
  addCodeudor(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { name, documentId, contact, validFrom, validUntil } = body as {
      name?: unknown;
      documentId?: unknown;
      contact?: unknown;
      validFrom?: unknown;
      validUntil?: unknown;
    };
    if (typeof name !== "string" || typeof validFrom !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (documentId !== undefined && documentId !== null && typeof documentId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (contact !== undefined && contact !== null && typeof contact !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (validUntil !== undefined && validUntil !== null && typeof validUntil !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.addCodeudor(orgIdOf(req), actorIdOf(req), id, {
      name,
      documentId: typeof documentId === "string" ? documentId : null,
      contact: typeof contact === "string" ? contact : null,
      validFrom,
      validUntil: typeof validUntil === "string" ? validUntil : null,
    });
  }

  @Get("contracts/:id/codeudores")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Contract codeudores." })
  listCodeudores(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.rental.listCodeudores(id, orgIdOf(req));
  }

  @Get("codeudor-expiries")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Codeudor policies expiring within N days." })
  listExpiringPolicies(@Req() req: ActorRequest) {
    const raw = (req.query as Record<string, unknown> | undefined)?.["withinDays"];
    const withinDays = typeof raw === "string" ? Number.parseInt(raw, 10) : 30;
    return this.rental.listExpiringPolicies(
      orgIdOf(req),
      Number.isInteger(withinDays) ? withinDays : 30,
    );
  }
}
