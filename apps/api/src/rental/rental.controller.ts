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

  @Post("contracts/:id/charges-from-reading")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Generate a utility charge from a meter reading." })
  chargeFromReading(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { readingId, ratePerUnit, period, confirmAnomaly } = body as {
      readingId?: unknown;
      ratePerUnit?: unknown;
      period?: unknown;
      confirmAnomaly?: unknown;
    };
    if (
      typeof readingId !== "string" ||
      typeof ratePerUnit !== "number" ||
      typeof period !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (confirmAnomaly !== undefined && typeof confirmAnomaly !== "boolean") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.chargeFromReading(
      orgIdOf(req),
      actorIdOf(req),
      id,
      confirmAnomaly === undefined
        ? { readingId, ratePerUnit, period }
        : { readingId, ratePerUnit, period, confirmAnomaly },
    );
  }

  @Post("contracts/:id/charges")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Ad-hoc charge (PH cuotas, fines, adjustments)." })
  createAdHocCharge(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { type, description, amount, period } = body as {
      type?: unknown;
      description?: unknown;
      amount?: unknown;
      period?: unknown;
    };
    if (
      typeof type !== "string" ||
      typeof description !== "string" ||
      typeof amount !== "number" ||
      typeof period !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.createAdHocCharge(orgIdOf(req), actorIdOf(req), id, {
      type,
      description,
      amount,
      period,
    });
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

  @Get("contracts-expiring")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Contracts expiring within N days (90/60/30 stages)." })
  listExpiringContracts(@Req() req: ActorRequest) {
    const raw = (req.query as Record<string, unknown> | undefined)?.["withinDays"];
    const withinDays = typeof raw === "string" ? Number.parseInt(raw, 10) : 90;
    return this.rental.listExpiringContracts(
      orgIdOf(req),
      Number.isInteger(withinDays) ? withinDays : 90,
    );
  }

  @Post("contracts/:id/renew")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 200, description: "Contract renewed with a later end date." })
  renewContract(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { newEndDate, rentAmount } = body as { newEndDate?: unknown; rentAmount?: unknown };
    if (typeof newEndDate !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (rentAmount !== undefined && typeof rentAmount !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.renewContract(
      orgIdOf(req),
      actorIdOf(req),
      id,
      typeof rentAmount === "number" ? { newEndDate, rentAmount } : { newEndDate },
    );
  }

  @Post("contracts/:id/terminate")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Contract terminated with indemnity quote." })
  terminateContract(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { noticeDate, effectiveDate, cause, ruleId } = body as {
      noticeDate?: unknown;
      effectiveDate?: unknown;
      cause?: unknown;
      ruleId?: unknown;
    };
    if (
      typeof noticeDate !== "string" ||
      typeof effectiveDate !== "string" ||
      typeof cause !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (
      ruleId !== undefined &&
      ruleId !== "GENERIC_NO_INDEMNITY" &&
      ruleId !== "CO_EARLY_TERMINATION_DEFAULT"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.terminateContract(
      orgIdOf(req),
      actorIdOf(req),
      id,
      ruleId === undefined
        ? { noticeDate, effectiveDate, cause }
        : { noticeDate, effectiveDate, cause, ruleId },
    );
  }

  @Get("contracts/:id/termination")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Contract termination detail." })
  getTermination(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.rental.getTermination(id, orgIdOf(req));
  }

  @Get("contracts/:id/schedule")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Rent schedule for N months from a period." })
  getSchedule(@Req() req: ActorRequest, @Param("id") id: string) {
    const query = (req.query as Record<string, unknown> | undefined) ?? {};
    const from = typeof query["from"] === "string" ? query["from"] : "";
    const months = typeof query["months"] === "string" ? Number.parseInt(query["months"], 10) : 12;
    if (!from) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.getSchedule(id, orgIdOf(req), from, Number.isInteger(months) ? months : 12);
  }

  @Post("rent-index")
  @RequirePermission("contract:write")
  @ApiResponse({
    status: 201,
    description: "Record IPC/index value (provider fetch or manual correction).",
  })
  recordRentIndex(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { country, period, value, source } = body as {
      country?: unknown;
      period?: unknown;
      value?: unknown;
      source?: unknown;
    };
    if (
      typeof country !== "string" ||
      typeof period !== "string" ||
      typeof value !== "number" ||
      typeof source !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.recordRentIndex(orgIdOf(req), actorIdOf(req), {
      country,
      period,
      value,
      source,
    });
  }

  @Get("rent-index")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Get IPC/index value for country/period." })
  getRentIndex(@Req() req: ActorRequest) {
    const query = (req.query as Record<string, unknown> | undefined) ?? {};
    const country = typeof query["country"] === "string" ? query["country"] : "";
    const period = typeof query["period"] === "string" ? query["period"] : "";
    if (!country || !period) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.getRentIndex(country, period);
  }

  @Post("contracts/:id/rent-increase")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Apply IPC increase with country-pluggable cap." })
  applyRentIncrease(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { indexPeriod, country, capPct } = body as {
      indexPeriod?: unknown;
      country?: unknown;
      capPct?: unknown;
    };
    if (typeof indexPeriod !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (country !== undefined && typeof country !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (capPct !== undefined && typeof capPct !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.applyRentIncrease(
      orgIdOf(req),
      actorIdOf(req),
      id,
      country === undefined && capPct === undefined
        ? { indexPeriod }
        : {
            indexPeriod,
            ...(country === undefined ? {} : { country: country as string }),
            ...(capPct === undefined ? {} : { capPct: capPct as number }),
          },
    );
  }

  @Post("units/:unitId/meter-readings")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Record a utility meter reading with anomaly flags." })
  recordMeterReading(
    @Req() req: ActorRequest,
    @Param("unitId") unitId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { utility, value, readingDate, photoRef } = body as {
      utility?: unknown;
      value?: unknown;
      readingDate?: unknown;
      photoRef?: unknown;
    };
    if (
      typeof utility !== "string" ||
      typeof value !== "number" ||
      typeof readingDate !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (photoRef !== undefined && photoRef !== null && typeof photoRef !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.recordMeterReading(
      orgIdOf(req),
      actorIdOf(req),
      unitId,
      photoRef === undefined || photoRef === null
        ? { utility, value, readingDate }
        : { utility, value, readingDate, photoRef },
    );
  }

  @Get("units/:unitId/meter-readings")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "List meter readings for a unit." })
  listMeterReadings(@Req() req: ActorRequest, @Param("unitId") unitId: string) {
    const query = (req.query as Record<string, unknown> | undefined) ?? {};
    const utility = typeof query["utility"] === "string" ? query["utility"] : undefined;
    return this.rental.listMeterReadings(unitId, orgIdOf(req), utility);
  }

  @Post("contracts/:id/deposits")
  @RequirePermission("payment:write")
  @ApiResponse({ status: 201, description: "Record a held deposit for a contract." })
  recordDeposit(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { held } = body as { held?: unknown };
    if (typeof held !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.recordDeposit(orgIdOf(req), actorIdOf(req), id, held);
  }

  @Get("contracts/:id/deposits")
  @RequirePermission("payment:read")
  @ApiResponse({ status: 200, description: "List deposits with remaining balances." })
  listDeposits(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.rental.listDeposits(id, orgIdOf(req));
  }

  @Post("deposits/:id/deduct")
  @RequirePermission("payment:write")
  @ApiResponse({ status: 200, description: "Deduct from a held deposit." })
  deductDeposit(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { amount } = body as { amount?: unknown };
    if (typeof amount !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.moveDeposit(orgIdOf(req), actorIdOf(req), id, "deduct", amount);
  }

  @Post("deposits/:id/return")
  @RequirePermission("payment:write")
  @ApiResponse({ status: 200, description: "Return part of a held deposit." })
  returnDeposit(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { amount } = body as { amount?: unknown };
    if (typeof amount !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.moveDeposit(orgIdOf(req), actorIdOf(req), id, "return", amount);
  }

  @Get("contracts/:id/aging")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Aging report: current, 1-30, 31-60, 61-90, 90+ days." })
  getAging(@Req() req: ActorRequest, @Param("id") id: string) {
    const query = (req.query as Record<string, unknown> | undefined) ?? {};
    const asOf = typeof query["asOf"] === "string" ? query["asOf"] : undefined;
    return asOf === undefined
      ? this.rental.getAging(id, orgIdOf(req))
      : this.rental.getAging(id, orgIdOf(req), asOf);
  }

  @Post("late-fee-rules")
  @RequirePermission("contract:write")
  @ApiResponse({
    status: 201,
    description: "Configure a late-fee rule (country/org/contract scope).",
  })
  configureLateFeeRule(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { scope, contractId, rateType, rate, graceDays, base } = body as {
      scope?: unknown;
      contractId?: unknown;
      rateType?: unknown;
      rate?: unknown;
      graceDays?: unknown;
      base?: unknown;
    };
    if (scope !== "COUNTRY" && scope !== "ORGANIZATION" && scope !== "CONTRACT") {
      throw new ForbiddenException("Invalid request.");
    }
    if (contractId !== undefined && typeof contractId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (rateType !== "PERCENTAGE" && rateType !== "FIXED") {
      throw new ForbiddenException("Invalid request.");
    }
    if (typeof rate !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    if (graceDays !== undefined && typeof graceDays !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    if (base !== undefined && base !== "TOTAL_DUE" && base !== "RENT_ONLY") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.rental.configureLateFeeRule(
      orgIdOf(req),
      actorIdOf(req),
      (() => {
        const baseInput = { scope, rateType, rate } as {
          scope: "COUNTRY" | "ORGANIZATION" | "CONTRACT";
          rateType: "PERCENTAGE" | "FIXED";
          rate: number;
          contractId?: string;
          graceDays?: number;
          base?: "TOTAL_DUE" | "RENT_ONLY";
        };
        if (typeof contractId === "string") {
          baseInput.contractId = contractId;
        }
        if (typeof graceDays === "number") {
          baseInput.graceDays = graceDays;
        }
        if (base === "TOTAL_DUE" || base === "RENT_ONLY") {
          baseInput.base = base;
        }
        return baseInput;
      })(),
    );
  }

  @Get("contracts/:id/late-fee")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "Evaluate late fees for pending charges." })
  evaluateLateFee(@Req() req: ActorRequest, @Param("id") id: string) {
    const query = (req.query as Record<string, unknown> | undefined) ?? {};
    const asOf = typeof query["asOf"] === "string" ? query["asOf"] : undefined;
    return asOf === undefined
      ? this.rental.evaluateLateFee(id, orgIdOf(req))
      : this.rental.evaluateLateFee(id, orgIdOf(req), asOf);
  }

  @Post("charges/:chargeId/dunning")
  @RequirePermission("contract:write")
  @ApiResponse({ status: 201, description: "Record a dunning event for an overdue charge." })
  recordDunningEvent(
    @Req() req: ActorRequest,
    @Param("chargeId") chargeId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { channel, asOf } = body as { channel?: unknown; asOf?: unknown };
    if (channel !== "IN_APP" && channel !== "EMAIL") {
      throw new ForbiddenException("Invalid request.");
    }
    if (asOf !== undefined && typeof asOf !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return typeof asOf === "string"
      ? this.rental.recordDunningEvent(orgIdOf(req), actorIdOf(req), chargeId, channel, asOf)
      : this.rental.recordDunningEvent(orgIdOf(req), actorIdOf(req), chargeId, channel);
  }

  @Get("contracts/:id/dunning")
  @RequirePermission("contract:read")
  @ApiResponse({ status: 200, description: "List dunning events for a contract." })
  listDunningEvents(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.rental.listDunningEvents(id, orgIdOf(req));
  }
}
