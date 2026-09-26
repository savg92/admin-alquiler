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
import type { DataClass, ExecutionMode, QuestionType } from "@admin-alquiler/ai";
import { JwtAuthGuard, type RequestActor } from "../auth/jwt.guard";
import { PermissionsGuard, RequirePermission } from "../auth/permissions.guard";
import { AiService } from "./ai.service";
import { RegistryService } from "./registry.service";

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

const DATA_CLASSES = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "SENSITIVE",
  "FINANCIAL",
  "LEGAL",
  "PERSONAL",
];
const MODES = ["disabled", "webgpu", "local", "hybrid", "provider"];

function parseDataClasses(value: unknown): DataClass[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ForbiddenException("Invalid request.");
  }
  for (const entry of value) {
    if (typeof entry !== "string" || !DATA_CLASSES.includes(entry)) {
      throw new ForbiddenException("Invalid request.");
    }
  }
  return value as DataClass[];
}

function parseMode(value: unknown): ExecutionMode | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !MODES.includes(value)) {
    throw new ForbiddenException("Invalid request.");
  }
  return value as ExecutionMode;
}

function parseClientWebgpu(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ForbiddenException("Invalid request.");
  }
  return value;
}

@ApiTags("ai")
@Controller("api/v1/ai")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly registry: RegistryService,
  ) {}

  @Get("status")
  @RequirePermission("ai:read")
  @ApiResponse({ status: 200, description: "Gateway status without secrets." })
  status(@Req() req: ActorRequest) {
    void orgIdOf(req);
    return this.ai.status();
  }

  @Post("text")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Generate text via the gateway." })
  generateText(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { feature, prompt, dataClasses, mode, maxTokens, clientWebgpu } = body as Record<
      string,
      unknown
    >;
    if (typeof feature !== "string" || typeof prompt !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (maxTokens !== undefined && typeof maxTokens !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    const parsedMode = parseMode(mode);
    const parsedWebgpu = parseClientWebgpu(clientWebgpu);
    return this.ai.generateText(orgIdOf(req), actorIdOf(req), {
      feature,
      prompt,
      dataClasses: parseDataClasses(dataClasses),
      ...(maxTokens === undefined ? {} : { maxTokens: maxTokens as number }),
      ...(parsedMode === undefined ? {} : { mode: parsedMode }),
      ...(parsedWebgpu === undefined ? {} : { clientWebgpu: parsedWebgpu }),
    });
  }

  @Post("structured")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Generate schema-validated structured output." })
  generateStructured(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { feature, prompt, schema, dataClasses, mode } = body as Record<string, unknown>;
    if (typeof feature !== "string" || typeof prompt !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.ai.generateStructuredOutput(orgIdOf(req), actorIdOf(req), {
      feature,
      prompt,
      schema: schema as Record<string, unknown>,
      dataClasses: parseDataClasses(dataClasses),
      ...(parseMode(mode) === undefined ? {} : { mode: parseMode(mode) as ExecutionMode }),
    });
  }

  @Post("embeddings")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Generate an embedding vector." })
  generateEmbedding(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { feature, text, dataClasses, mode } = body as Record<string, unknown>;
    if (typeof feature !== "string" || typeof text !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.ai.generateEmbedding(orgIdOf(req), actorIdOf(req), {
      feature,
      text,
      dataClasses: parseDataClasses(dataClasses),
      ...(parseMode(mode) === undefined ? {} : { mode: parseMode(mode) as ExecutionMode }),
    });
  }

  @Post("decide")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Typed decision with calibrated confidence." })
  decide(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { feature, question, questionType, options, dataClasses, mode } = body as Record<
      string,
      unknown
    >;
    if (
      typeof feature !== "string" ||
      typeof question !== "string" ||
      typeof questionType !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    if (!["triage", "proof-match", "dunning", "generic"].includes(questionType)) {
      throw new ForbiddenException("Invalid request.");
    }
    if (
      options !== undefined &&
      (!Array.isArray(options) || !options.every((entry) => typeof entry === "string"))
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.ai.decide(orgIdOf(req), actorIdOf(req), {
      feature,
      question,
      questionType: questionType as QuestionType,
      dataClasses: parseDataClasses(dataClasses),
      ...(Array.isArray(options) ? { options: options as string[] } : {}),
      ...(parseMode(mode) === undefined ? {} : { mode: parseMode(mode) as ExecutionMode }),
    });
  }

  @Post("vision")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Analyze a local image with a vision model." })
  analyzeImage(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { feature, prompt, image, dataClasses, mode } = body as Record<string, unknown>;
    if (typeof feature !== "string" || typeof prompt !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      throw new ForbiddenException("Invalid request.");
    }
    const { mediaType, base64 } = image as Record<string, unknown>;
    if (typeof mediaType !== "string" || typeof base64 !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.ai.analyzeImage(orgIdOf(req), actorIdOf(req), {
      feature,
      prompt,
      image: { mediaType, base64 },
      dataClasses: parseDataClasses(dataClasses),
      ...(parseMode(mode) === undefined ? {} : { mode: parseMode(mode) as ExecutionMode }),
    });
  }

  @Post("complete")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Validate a client-executed (WebGPU) result." })
  complete(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { feature, result, model } = body as Record<string, unknown>;
    if (typeof feature !== "string" || typeof result !== "string" || typeof model !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.ai.completeDeferred(orgIdOf(req), actorIdOf(req), feature, result, model);
  }

  @Post("models")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Register a model (starts as candidate)." })
  registerModel(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const {
      modelId,
      version,
      provider,
      runtime,
      quantization,
      capabilities,
      contextSize,
      languages,
      privacyTier,
      hardware,
    } = body as Record<string, unknown>;
    if (
      typeof modelId !== "string" ||
      typeof version !== "string" ||
      typeof provider !== "string" ||
      typeof runtime !== "string"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.registry.registerModel(orgIdOf(req), actorIdOf(req), {
      modelId,
      version,
      provider,
      runtime,
      ...(typeof quantization === "string" ? { quantization } : {}),
      ...(Array.isArray(capabilities) ? { capabilities: capabilities as string[] } : {}),
      ...(typeof contextSize === "number" ? { contextSize } : {}),
      ...(Array.isArray(languages) ? { languages: languages as string[] } : {}),
      ...(typeof privacyTier === "string" ? { privacyTier } : {}),
      ...(typeof hardware === "object" && hardware !== null
        ? { hardware: hardware as Record<string, unknown> }
        : {}),
    });
  }

  @Get("models")
  @RequirePermission("ai:read")
  @ApiResponse({ status: 200, description: "Model registry." })
  listModels(
    @Req() req: ActorRequest,
    @Query("status") status?: string,
    @Query("runtime") runtime?: string,
  ) {
    void orgIdOf(req);
    return this.registry.listModels(status, runtime);
  }

  @Post("models/:id/evaluations")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Record an evaluation score for a model." })
  recordEvaluation(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { score } = body as { score?: unknown };
    if (typeof score !== "number") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.registry.recordEvaluation(orgIdOf(req), actorIdOf(req), id, score);
  }

  @Post("models/:id/transitions")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Advance model lifecycle (no auto-deploy)." })
  transitionModel(@Req() req: ActorRequest, @Param("id") id: string, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { to } = body as { to?: unknown };
    if (typeof to !== "string") {
      throw new ForbiddenException("Invalid request.");
    }
    return this.registry.transitionModel(orgIdOf(req), actorIdOf(req), id, to);
  }

  @Post("observations")
  @RequirePermission("ai:write")
  @ApiResponse({ status: 201, description: "Log a decision outcome for calibration." })
  recordObservation(@Req() req: ActorRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object") {
      throw new ForbiddenException("Invalid request.");
    }
    const { modelId, questionType, confidence, correct } = body as Record<string, unknown>;
    if (
      typeof modelId !== "string" ||
      typeof questionType !== "string" ||
      typeof confidence !== "number" ||
      typeof correct !== "boolean"
    ) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.ai.recordObservation(orgIdOf(req), actorIdOf(req), {
      modelId,
      questionType,
      confidence,
      correct,
    });
  }

  @Get("calibration")
  @RequirePermission("ai:read")
  @ApiResponse({ status: 200, description: "Fitted temperature and ECE per model/question." })
  calibration(
    @Req() req: ActorRequest,
    @Query("modelId") modelId?: string,
    @Query("questionType") questionType?: string,
  ) {
    void orgIdOf(req);
    if (!modelId || !questionType) {
      throw new ForbiddenException("Invalid request.");
    }
    return this.ai.calibration(modelId, questionType);
  }

  @Get("modes")
  @RequirePermission("ai:read")
  @ApiResponse({ status: 200, description: "Execution modes and priority." })
  modes(@Req() req: ActorRequest, @Query("priority") _priority?: string) {
    void orgIdOf(req);
    void _priority;
    return this.ai.modes();
  }
}
