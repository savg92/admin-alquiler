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
import { CommunicationsService } from "./communications.service";

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

@ApiTags("communications")
@Controller("api/v1")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunicationsController {
  constructor(private readonly comms: CommunicationsService) {}

  @Post("notifications")
  @RequirePermission("communication:write")
  @ApiResponse({ status: 201, description: "In-app/email notification created." })
  notify(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const {
      userId,
      channel,
      title,
      body: text,
    } = body as {
      userId?: unknown;
      channel?: unknown;
      title?: unknown;
      body?: unknown;
    };
    if (channel !== "IN_APP" && channel !== "EMAIL") {
      throw new ForbiddenException("Invalid request.");
    }
    if (userId !== undefined && userId !== null && typeof userId !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (typeof title !== "string" || typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.comms.notify(
      orgIdOf(req),
      actorIdOf(req),
      userId === undefined || userId === null
        ? { channel, title, body: text }
        : { userId, channel, title, body: text },
    );
  }

  @Get("notifications/mine")
  @RequirePermission("communication:read")
  @ApiResponse({ status: 200, description: "Own notifications, optionally unread only." })
  myNotifications(@Req() req: ActorRequest) {
    const query = (req.query as Record<string, unknown> | undefined) ?? {};
    const unreadOnly = query["unreadOnly"] === "true";
    return this.comms.myNotifications(orgIdOf(req), actorIdOf(req), unreadOnly);
  }

  @Post("notifications/:id/read")
  @RequirePermission("communication:read")
  @ApiResponse({ status: 200, description: "Mark a notification as read." })
  markRead(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.comms.markRead(orgIdOf(req), actorIdOf(req), id);
  }

  @Get("notification-preferences/mine")
  @RequirePermission("communication:read")
  @ApiResponse({ status: 200, description: "Own notification channel preferences." })
  myPreferences(@Req() req: ActorRequest) {
    return this.comms.myPreferences(orgIdOf(req), actorIdOf(req));
  }

  @Post("notification-preferences")
  @RequirePermission("communication:read")
  @ApiResponse({ status: 200, description: "Set a notification channel preference." })
  setPreference(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { channel, enabled } = body as { channel?: unknown; enabled?: unknown };
    if (channel !== "IN_APP" && channel !== "EMAIL") {
      throw new ForbiddenException("Invalid request.");
    }
    if (typeof enabled !== "boolean") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.comms.setPreference(orgIdOf(req), actorIdOf(req), channel, enabled);
  }
}
