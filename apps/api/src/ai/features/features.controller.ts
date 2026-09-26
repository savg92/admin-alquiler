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
import { JwtAuthGuard, type RequestActor } from "../../auth/jwt.guard";
import { PermissionsGuard, RequirePermission } from "../../auth/permissions.guard";
import { AiFeaturesService } from "./features.service";

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

function bodyOf(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ForbiddenException("Invalid request.");
  }
  return body as Record<string, unknown>;
}

const STATUSES = ["PENDING", "CONFIRMED", "REJECTED"] as const;

function parseStatus(value: unknown): "PENDING" | "CONFIRMED" | "REJECTED" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !(STATUSES as readonly string[]).includes(value)) {
    throw new ForbiddenException("Invalid request.");
  }
  return value as "PENDING" | "CONFIRMED" | "REJECTED";
}

const QUESTION_TYPES = ["triage", "proof-match", "dunning", "generic"] as const;

@ApiTags("ai")
@Controller("api/v1/ai/suggestions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiFeaturesController {
  constructor(private readonly features: AiFeaturesService) {}

  @Post("draft")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Draft a document as a confirmable suggestion." })
  draft(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = bodyOf(body);
    return this.features.draft(orgIdOf(req), actorIdOf(req), {
      documentType: String(input["documentType"] ?? ""),
      fields: (input["fields"] ?? {}) as Record<string, string>,
      ...(input["locale"] === undefined ? {} : { locale: String(input["locale"]) }),
    });
  }

  @Post("communication")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Draft a message as a confirmable suggestion." })
  communication(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = bodyOf(body);
    return this.features.assistCommunication(orgIdOf(req), actorIdOf(req), {
      recipient: String(input["recipient"] ?? ""),
      purpose: String(input["purpose"] ?? ""),
      ...(input["tone"] === undefined ? {} : { tone: String(input["tone"]) }),
      ...(input["locale"] === undefined ? {} : { locale: String(input["locale"]) }),
    });
  }

  @Post("summarize")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Summarize a document as a confirmable suggestion." })
  summarize(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = bodyOf(body);
    const maxSentences = input["maxSentences"];
    return this.features.summarize(orgIdOf(req), actorIdOf(req), {
      text: String(input["text"] ?? ""),
      ...(maxSentences === undefined ? {} : { maxSentences: Number(maxSentences) }),
      ...(input["locale"] === undefined ? {} : { locale: String(input["locale"]) }),
    });
  }

  @Post("extract")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Extract schema-validated fields as a suggestion." })
  extract(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = bodyOf(body);
    return this.features.extract(orgIdOf(req), actorIdOf(req), {
      text: String(input["text"] ?? ""),
      ...(input["locale"] === undefined ? {} : { locale: String(input["locale"]) }),
    });
  }

  @Post("classify")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Classify a request into allowed categories." })
  classify(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = bodyOf(body);
    return this.features.classify(orgIdOf(req), actorIdOf(req), {
      text: String(input["text"] ?? ""),
      ...(input["complaint"] === undefined ? {} : { complaint: input["complaint"] === true }),
      ...(input["locale"] === undefined ? {} : { locale: String(input["locale"]) }),
    });
  }

  @Post("vision")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Analyze an image as a confirmable suggestion." })
  vision(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = bodyOf(body);
    const image = input["image"];
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      throw new ForbiddenException("Invalid request.");
    }
    const { mediaType, base64 } = image as Record<string, unknown>;
    return this.features.analyzeImage(orgIdOf(req), actorIdOf(req), {
      mediaType: String(mediaType ?? ""),
      base64: String(base64 ?? ""),
      ...(input["instruction"] === undefined ? {} : { instruction: String(input["instruction"]) }),
      ...(input["locale"] === undefined ? {} : { locale: String(input["locale"]) }),
    });
  }

  @Post("triage")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Bounded-answer triage; a human confirms the action." })
  triage(@Req() req: ActorRequest, @Body() body: unknown) {
    const input = bodyOf(body);
    const questionType = input["questionType"];
    if (
      typeof questionType !== "string" ||
      !(QUESTION_TYPES as readonly string[]).includes(questionType)
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    const options = input["options"];
    if (
      options !== undefined &&
      (!Array.isArray(options) || !options.every((entry) => typeof entry === "string"))
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.features.triage(orgIdOf(req), actorIdOf(req), {
      question: String(input["question"] ?? ""),
      questionType: questionType as (typeof QUESTION_TYPES)[number],
      ...(Array.isArray(options) ? { options: options as string[] } : {}),
    });
  }

  @Get()
  @RequirePermission("ai:read")
  @ApiResponse({ status: 200, description: "Suggestions for the organization." })
  list(
    @Req() req: ActorRequest,
    @Query("feature") feature?: string,
    @Query("status") status?: string,
  ) {
    const parsedStatus = parseStatus(status);
    return this.features.list(orgIdOf(req), {
      ...(feature === undefined ? {} : { feature }),
      ...(parsedStatus === undefined ? {} : { status: parsedStatus }),
    });
  }

  @Get(":id")
  @RequirePermission("ai:read")
  @ApiResponse({ status: 200, description: "A single suggestion." })
  get(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.features.get(orgIdOf(req), id);
  }

  @Post(":id/confirm")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Record a human confirmation." })
  confirm(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.features.confirm(orgIdOf(req), actorIdOf(req), id);
  }

  @Post(":id/reject")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Record a human rejection." })
  reject(@Req() req: ActorRequest, @Param("id") id: string) {
    return this.features.reject(orgIdOf(req), actorIdOf(req), id);
  }
}
