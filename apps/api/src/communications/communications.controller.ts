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

  @Post("communications")
  @RequirePermission("communication:write")
  @ApiResponse({
    status: 201,
    description: "Send via template or raw body; email is queued async.",
  })
  sendCommunication(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const {
      channel,
      recipients,
      subject,
      body: text,
      locale,
      templateKey,
      templateVars,
      related,
    } = body as {
      channel?: unknown;
      recipients?: unknown;
      subject?: unknown;
      body?: unknown;
      locale?: unknown;
      templateKey?: unknown;
      templateVars?: unknown;
      related?: unknown;
    };
    if (channel !== "IN_APP" && channel !== "EMAIL") {
      throw new ForbiddenException("Invalid request.");
    }
    if (!recipients || typeof recipients !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { users, emails } = recipients as { users?: unknown; emails?: unknown };
    if (
      (users !== undefined && !Array.isArray(users)) ||
      (emails !== undefined && !Array.isArray(emails))
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (subject !== undefined && subject !== null && typeof subject !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (text !== undefined && typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (typeof locale !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (templateKey !== undefined && typeof templateKey !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (templateVars !== undefined && (typeof templateVars !== "object" || templateVars === null)) {
      throw new ForbiddenException("Invalid request.");
    }
    if (related !== undefined && related !== null && typeof related !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.comms.sendCommunication(orgIdOf(req), actorIdOf(req), {
      channel,
      recipients: {
        ...(Array.isArray(users) ? { users: users as string[] } : {}),
        ...(Array.isArray(emails) ? { emails: emails as string[] } : {}),
      },
      locale,
      ...(typeof subject === "string" ? { subject } : {}),
      ...(typeof text === "string" ? { body: text } : {}),
      ...(typeof templateKey === "string" ? { templateKey } : {}),
      ...(templateVars !== undefined && templateVars !== null
        ? { templateVars: templateVars as Record<string, string | number> }
        : {}),
      ...(related !== undefined && related !== null
        ? { related: related as Record<string, unknown> }
        : {}),
    });
  }

  @Get("communications")
  @RequirePermission("communication:read")
  @ApiResponse({ status: 200, description: "Communication records." })
  listCommunications(@Req() req: ActorRequest) {
    return this.comms.listCommunications(orgIdOf(req));
  }

  @Post("communication-templates")
  @RequirePermission("communication:write")
  @ApiResponse({ status: 201, description: "Create or update a channel-neutral template." })
  upsertTemplate(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const {
      key,
      locale,
      subject,
      body: text,
    } = body as {
      key?: unknown;
      locale?: unknown;
      subject?: unknown;
      body?: unknown;
    };
    if (typeof key !== "string" || typeof locale !== "string" || typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (subject !== undefined && subject !== null && typeof subject !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.comms.upsertTemplate(
      orgIdOf(req),
      actorIdOf(req),
      typeof subject === "string"
        ? { key, locale, subject, body: text }
        : { key, locale, body: text },
    );
  }

  @Get("communication-templates")
  @RequirePermission("communication:read")
  @ApiResponse({ status: 200, description: "Channel-neutral templates (org + global)." })
  listTemplates(@Req() req: ActorRequest) {
    return this.comms.listTemplates(orgIdOf(req));
  }

  @Get("outbox/pending")
  @RequirePermission("communication:read")
  @ApiResponse({ status: 200, description: "Pending async deliveries with attempt counts." })
  pendingOutbox(@Req() req: ActorRequest) {
    const query = (req.query as Record<string, unknown> | undefined) ?? {};
    const limit = typeof query["limit"] === "string" ? Number.parseInt(query["limit"], 10) : 20;
    return this.comms.pendingOutbox(orgIdOf(req), Number.isInteger(limit) ? limit : 20);
  }

  @Post("outbox/:id/processed")
  @RequirePermission("communication:write")
  @ApiResponse({ status: 200, description: "Mark a delivery processed or queue a retry." })
  markOutbox(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    const error =
      body !== null && typeof body === "object" && "error" in body
        ? (body as { error?: unknown }).error
        : undefined;
    if (error !== undefined && typeof error !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return typeof error === "string"
      ? this.comms.markOutbox(orgIdOf(req), actorIdOf(req), id, error)
      : this.comms.markOutbox(orgIdOf(req), actorIdOf(req), id);
  }
}
