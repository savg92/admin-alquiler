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
import { FinanceService } from "./finance.service";

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

@ApiTags("finance")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Post("bank-imports")
  @RequirePermission("finance:write")
  @ApiResponse({ status: 201, description: "Bank CSV imported with dedupe and quarantine." })
  importBank(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { bank, csv } = body as { bank?: unknown; csv?: unknown };
    if (typeof bank !== "string" || typeof csv !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.finance.importBank(orgIdOf(req), actorIdOf(req), bank, csv);
  }

  @Get("bank-transactions")
  @RequirePermission("finance:read")
  @ApiResponse({
    status: 200,
    description: "Bank transactions, optionally filtered by quarantine.",
  })
  listBankTransactions(@Req() req: ActorRequest, @Query("quarantined") quarantined?: string) {
    const filter =
      quarantined === undefined
        ? undefined
        : quarantined === "true"
          ? true
          : quarantined === "false"
            ? false
            : undefined;
    if (quarantined !== undefined && filter === undefined) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.finance.listBankTransactions(orgIdOf(req), filter);
  }

  @Get("bank-transactions/:id/suggestions")
  @RequirePermission("finance:read")
  @ApiResponse({ status: 200, description: "Ranked payment-match suggestions (human confirms)." })
  suggestMatches(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.finance.suggestMatches(orgIdOf(req), id);
  }

  @Post("reconciliations")
  @RequirePermission("finance:write")
  @ApiResponse({ status: 201, description: "Human-confirmed reconciliation." })
  confirmReconciliation(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { bankTransactionId, note } = body as { bankTransactionId?: unknown; note?: unknown };
    if (typeof bankTransactionId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.finance.confirmReconciliation(
      orgIdOf(req),
      actorIdOf(req),
      bankTransactionId,
      typeof note === "string" ? note : undefined,
    );
  }

  @Post("accounts")
  @RequirePermission("finance:write")
  @ApiResponse({ status: 201, description: "Chart-of-accounts entry created." })
  createAccount(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { code, name } = body as { code?: unknown; name?: unknown };
    if (typeof code !== "string" || typeof name !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.finance.createAccount(orgIdOf(req), actorIdOf(req), code, name);
  }

  @Get("accounts")
  @RequirePermission("finance:read")
  @ApiResponse({ status: 200, description: "Organization chart of accounts." })
  listAccounts(@Req() req: ActorRequest) {
    return this.finance.listAccounts(orgIdOf(req));
  }

  @Post("categories")
  @RequirePermission("finance:write")
  @ApiResponse({ status: 201, description: "Transaction category created." })
  createCategory(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { name } = body as { name?: unknown };
    if (typeof name !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.finance.createCategory(orgIdOf(req), actorIdOf(req), name);
  }

  @Get("categories")
  @RequirePermission("finance:read")
  @ApiResponse({ status: 200, description: "Organization transaction categories." })
  listCategories(@Req() req: ActorRequest) {
    return this.finance.listCategories(orgIdOf(req));
  }

  @Post("transactions")
  @RequirePermission("finance:write")
  @ApiResponse({
    status: 201,
    description: "Financial transaction recorded with exact arithmetic.",
  })
  recordTransaction(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { accountId, categoryId, amount, currency, source, occurredAt, reference } = body as {
      accountId?: unknown;
      categoryId?: unknown;
      amount?: unknown;
      currency?: unknown;
      source?: unknown;
      occurredAt?: unknown;
      reference?: unknown;
    };
    if (
      typeof accountId !== "string" ||
      typeof amount !== "number" ||
      typeof currency !== "string" ||
      typeof source !== "string" ||
      typeof occurredAt !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (categoryId !== undefined && typeof categoryId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (reference !== undefined && reference !== null && typeof reference !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.finance.recordTransaction(orgIdOf(req), actorIdOf(req), {
      accountId,
      amount,
      currency,
      source,
      occurredAt,
      ...(typeof categoryId === "string" ? { categoryId } : {}),
      ...(typeof reference === "string" ? { reference } : {}),
    });
  }

  @Get("transactions")
  @RequirePermission("finance:read")
  @ApiResponse({ status: 200, description: "Financial transactions with optional filters." })
  listTransactions(
    @Req() req: ActorRequest,
    @Query("accountId") accountId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.finance.listTransactions(
      orgIdOf(req),
      accountId === undefined && from === undefined && to === undefined
        ? {}
        : {
            ...(accountId === undefined ? {} : { accountId }),
            ...(from === undefined ? {} : { from }),
            ...(to === undefined ? {} : { to }),
          },
    );
  }
}
