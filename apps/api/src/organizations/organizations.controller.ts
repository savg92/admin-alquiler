import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard, type RequestActor } from "../auth/jwt.guard";
import { PermissionsGuard, RequirePermission } from "../auth/permissions.guard";
import { OrganizationsService } from "./organizations.service";

interface ActorRequest extends Request {
  actor?: RequestActor;
}

function actorIdOf(req: ActorRequest): string {
  const actor = req.actor;
  if (!actor) {
    throw new ForbiddenException("Authentication required.");
  }
  return actor.userId;
}

function scopedOrgId(req: ActorRequest, pathId: string): string {
  const header = req.headers["x-org-id"];
  const orgId = Array.isArray(header) ? header[0] : header;
  if (!orgId || orgId !== pathId) {
    throw new ForbiddenException("Organization scope mismatch.");
  }
  return orgId;
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

  @Get("organizations/:id/members")
  @UseGuards(PermissionsGuard)
  @RequirePermission("member:read")
  @ApiResponse({ status: 200, description: "Organization members with roles and status." })
  listMembers(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.organizations.listMembers(scopedOrgId(req, id));
  }

  @Patch("organizations/:id/members/:userId")
  @UseGuards(PermissionsGuard)
  @RequirePermission("role:write")
  @ApiResponse({ status: 200, description: "Member role and/or status updated (audited)." })
  updateMember(
    @Req() req: ActorRequest,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { roleName, status } = body as { roleName?: unknown; status?: unknown };
    return this.organizations.updateMember(scopedOrgId(req, id), actorIdOf(req), userId, {
      roleName,
      status,
    });
  }
}
