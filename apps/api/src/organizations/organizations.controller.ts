import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard, type RequestActor } from "../auth/jwt.guard";
import { OrganizationsService } from "./organizations.service";

interface ActorRequest extends Request {
  actor?: RequestActor;
}

@ApiTags("organizations")
@Controller("api/v1")
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post("organizations")
  @ApiResponse({ status: 201, description: "Organization created with caller as admin." })
  createOrganization(@Req() req: ActorRequest, @Body() body: unknown) {
    const actor = req.actor;
    if (!actor) {
      throw new ForbiddenException("Authentication required.");
    }
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { name, slug, country, locale, currency, timezone } = body as {
      name?: unknown;
      slug?: unknown;
      country?: unknown;
      locale?: unknown;
      currency?: unknown;
      timezone?: unknown;
    };
    if (typeof name !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.organizations.createOrganization(actor.userId, {
      name,
      slug: typeof slug === "string" ? slug : undefined,
      country: typeof country === "string" ? country : undefined,
      locale: typeof locale === "string" ? locale : undefined,
      currency: typeof currency === "string" ? currency : undefined,
      timezone: typeof timezone === "string" ? timezone : undefined,
    });
  }
}
