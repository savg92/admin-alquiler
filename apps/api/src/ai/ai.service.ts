import { BadGatewayException, BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  allowedRuntimes,
  applyDecisionThreshold,
  defaultPriority,
  fitTemperature,
  expectedCalibrationError,
  minimizeFields,
  privacyLevelFor,
  redactPersonal,
  DECIDE_THRESHOLDS,
  type DataClass,
  type DecideResult,
  type ExecutionMode,
  type PrivacyLevel,
  type QuestionType,
  type RuntimeKind,
} from "@admin-alquiler/ai";
import { buildAuditEvent } from "@admin-alquiler/domain";
import { readAiConfig, type AiConfig } from "@admin-alquiler/config";
import { buildDecisionAdapter } from "./decision-adapters";
import { AiObservabilityService } from "./observability";
import { ProviderAdapter } from "./provider-adapter";
import { AI_STORE } from "./tokens";
import type { AiStore } from "./store";

interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

const EMPTY_USAGE: TokenUsage = { promptTokens: null, completionTokens: null };

const PRIVACY_LEVELS: readonly string[] = ["local-only", "local-preferred", "provider-allowed"];

function isPrivacyLevel(value: string): value is PrivacyLevel {
  return PRIVACY_LEVELS.includes(value);
}

function providerOf(config: AiConfig, runtime: RuntimeKind | undefined): string {
  if (runtime === "provider") {
    return config.externalProvider.length > 0 ? config.externalProvider : "provider";
  }
  if (runtime === "webgpu") {
    return "client";
  }
  if (runtime === "local") {
    return "self-hosted";
  }
  return "none";
}

const IMAGE_MEDIA_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_BASE64_CHARS = 7_000_000;

const VISION_SCHEMA = {
  type: "object",
  required: ["description"],
  properties: {
    description: { type: "string" },
    labels: { type: "array" },
  },
} as const;

interface CallContext {
  feature: string;
  dataClasses: DataClass[];
  mode: ExecutionMode;
  priority?: RuntimeKind[];
  clientWebgpu: boolean;
}

interface ResolvedCall {
  runtime: RuntimeKind;
  privacyLevel: string;
  model: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

@Injectable()
export class AiService {
  constructor(
    @Inject(AI_STORE) private readonly store: AiStore,
    private readonly metrics: AiObservabilityService,
  ) {}

  private config(): AiConfig {
    return readAiConfig();
  }

  private availability(config: AiConfig, clientWebgpu: boolean): Record<RuntimeKind, boolean> {
    return {
      disabled: true,
      webgpu: config.webgpuEnabled && clientWebgpu,
      local: config.localModels.length > 0,
      provider: config.externalProvider.length > 0 && config.providerBaseUrl.length > 0,
    };
  }

  private resolve(context: CallContext): ResolvedCall | null {
    const config = this.config();
    if (!config.enabled || context.mode === "disabled") {
      return null;
    }
    const level = privacyLevelFor(context.dataClasses);
    const available = this.availability(config, context.clientWebgpu);
    const allowed = allowedRuntimes(level, available.provider);
    const usable = (candidate: RuntimeKind): boolean =>
      candidate !== "disabled" && allowed.includes(candidate) && available[candidate] === true;
    if (context.mode !== "hybrid") {
      const pinned: RuntimeKind = context.mode;
      if (!usable(pinned)) {
        return null;
      }
      return { runtime: pinned, privacyLevel: level, model: this.pickModel(config, pinned) };
    }
    for (const candidate of context.priority ?? defaultPriority()) {
      if (usable(candidate)) {
        return {
          runtime: candidate,
          privacyLevel: level,
          model: this.pickModel(config, candidate),
        };
      }
    }
    return null;
  }

  private pickModel(config: AiConfig, runtime: RuntimeKind): string {
    if (runtime === "local") {
      return config.localModels[0] ?? "local-default";
    }
    if (runtime === "provider") {
      return config.externalProvider;
    }
    if (runtime === "webgpu") {
      return config.localModels[0] ?? "webgpu-default";
    }
    return "disabled";
  }

  status() {
    const config = this.config();
    return {
      enabled: config.enabled,
      defaultPriority: defaultPriority(),
      serverAvailable: this.availability(config, false),
      clientWebgpuEnabled: config.webgpuEnabled,
      localModels: config.localModels,
      externalProvider: config.externalProvider.length > 0 ? config.externalProvider : null,
      decision: {
        provider: config.decisionProvider,
        model: config.decisionModel,
        configured: config.decisionBaseUrl.length > 0,
      },
      limits: { timeoutMs: config.timeoutMs, maxRetries: config.maxRetries },
    };
  }

  modes() {
    const config = this.config();
    const providerConfigured =
      config.externalProvider.length > 0 && config.providerBaseUrl.length > 0;
    return {
      modes: ["disabled", "webgpu", "local", "hybrid", "provider"] as ExecutionMode[],
      defaultPriority: defaultPriority(),
      serverAvailable: this.availability(config, false),
      clientWebgpuEnabled: config.webgpuEnabled,
      privacy: {
        "local-only": allowedRuntimes("local-only", providerConfigured),
        "local-preferred": allowedRuntimes("local-preferred", providerConfigured),
        "provider-allowed": allowedRuntimes("provider-allowed", providerConfigured),
      },
      decideThresholds: DECIDE_THRESHOLDS,
    };
  }

  private async auditCall(
    orgId: string,
    actorId: string,
    feature: string,
    resolved: ResolvedCall | null,
    latencyMs: number,
    success: boolean,
    fallback: boolean,
    usage: TokenUsage = EMPTY_USAGE,
  ): Promise<void> {
    const runtime = resolved?.runtime ?? "disabled";
    const privacyMode = resolved?.privacyLevel ?? "unknown";
    this.metrics.record({
      feature,
      runtime,
      model: resolved?.model ?? "disabled",
      provider: providerOf(this.config(), resolved?.runtime),
      privacyMode: isPrivacyLevel(privacyMode) ? privacyMode : "unknown",
      latencyMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      fallback,
      success,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "ai.call",
        entityType: "AiCall",
        metadata: {
          feature,
          runtime,
          model: resolved?.model ?? null,
          privacyLevel: privacyMode,
          latencyMs,
          success,
          fallback,
        },
      }),
    );
  }

  private adapterFor(runtime: RuntimeKind): ProviderAdapter {
    const config = this.config();
    return runtime === "provider"
      ? new ProviderAdapter(config.providerBaseUrl, config.providerApiKey, config)
      : new ProviderAdapter(config.localBaseUrl, null, config);
  }

  async generateText(
    orgId: string,
    actorId: string,
    input: {
      feature: string;
      prompt: string;
      dataClasses: DataClass[];
      mode?: ExecutionMode;
      priority?: RuntimeKind[];
      clientWebgpu?: boolean;
      maxTokens?: number;
    },
  ): Promise<
    | { available: true; runtime: RuntimeKind; model: string; text: string; deferred: false }
    | {
        available: true;
        runtime: "webgpu";
        model: string;
        deferred: true;
        payload: Record<string, unknown>;
      }
    | { available: false; reason: string }
  > {
    const started = Date.now();
    if (input.prompt.trim().length === 0) {
      throw new BadRequestException("prompt must not be empty.");
    }
    const resolved = this.resolve({
      feature: input.feature,
      dataClasses: input.dataClasses,
      mode: input.mode ?? "hybrid",
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      clientWebgpu: input.clientWebgpu ?? false,
    });
    if (resolved === null) {
      await this.auditCall(orgId, actorId, input.feature, null, Date.now() - started, false, true);
      return { available: false, reason: "AI is disabled or no permitted runtime is available." };
    }
    if (resolved.runtime === "webgpu") {
      await this.auditCall(
        orgId,
        actorId,
        input.feature,
        resolved,
        Date.now() - started,
        true,
        false,
      );
      return {
        available: true,
        runtime: "webgpu",
        model: resolved.model,
        deferred: true,
        payload: { prompt: input.prompt, maxTokens: input.maxTokens ?? 512 },
      };
    }
    let prompt = input.prompt;
    if (resolved.runtime === "provider") {
      prompt = redactPersonal(input.prompt).redacted;
    }
    try {
      const completion = await this.adapterFor(resolved.runtime).chat({
        model: resolved.model,
        messages: [{ role: "user", content: prompt }],
        maxTokens: input.maxTokens ?? 512,
      });
      await this.auditCall(
        orgId,
        actorId,
        input.feature,
        resolved,
        Date.now() - started,
        true,
        false,
        completion.usage,
      );
      return {
        available: true,
        runtime: resolved.runtime,
        model: resolved.model,
        text: completion.text,
        deferred: false,
      };
    } catch (error) {
      await this.auditCall(
        orgId,
        actorId,
        input.feature,
        resolved,
        Date.now() - started,
        false,
        true,
      );
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException("Inference endpoint is unreachable.");
    }
  }

  async completeDeferred(
    orgId: string,
    actorId: string,
    feature: string,
    result: string,
    model: string,
  ): Promise<{ text: string; model: string }> {
    if (typeof result !== "string" || result.trim().length === 0 || result.length > 20000) {
      throw new BadRequestException("result must be 1-20000 characters.");
    }
    await this.auditCall(
      orgId,
      actorId,
      feature,
      { runtime: "webgpu", privacyLevel: "local-only", model },
      0,
      true,
      false,
    );
    return { text: result, model };
  }

  validateStructured(data: unknown, schema: Record<string, unknown>): Record<string, unknown> {
    const record = asRecord(data);
    if (!record) {
      throw new BadGatewayException("Model output is not a JSON object.");
    }
    const type = schema["type"];
    if (type !== undefined && type !== "object") {
      throw new BadGatewayException("Only object schemas are supported.");
    }
    const required = schema["required"];
    if (Array.isArray(required)) {
      for (const key of required) {
        if (typeof key === "string" && record[key] === undefined) {
          throw new BadGatewayException(`Model output misses required field "${key}".`);
        }
      }
    }
    const properties = asRecord(schema["properties"]);
    if (properties) {
      for (const [key, rule] of Object.entries(properties)) {
        const ruleRecord = asRecord(rule);
        const expected = ruleRecord?.["type"];
        const value = record[key];
        if (value === undefined || expected === undefined) {
          continue;
        }
        const actual = Array.isArray(value) ? "array" : typeof value;
        if (actual !== expected) {
          throw new BadGatewayException(`Field "${key}" must be ${expected}.`);
        }
        const allowed = ruleRecord?.["enum"];
        if (Array.isArray(allowed) && !allowed.includes(value)) {
          throw new BadGatewayException(`Field "${key}" is not an allowed value.`);
        }
      }
    }
    const minimized = minimizeFields(record, Object.keys(properties ?? record));
    return minimized as Record<string, unknown>;
  }

  async generateStructuredOutput(
    orgId: string,
    actorId: string,
    input: {
      feature: string;
      prompt: string;
      schema: Record<string, unknown>;
      dataClasses: DataClass[];
      mode?: ExecutionMode;
      clientWebgpu?: boolean;
    },
  ): Promise<
    | { available: true; runtime: RuntimeKind; model: string; data: Record<string, unknown> }
    | { available: false; reason: string }
  > {
    const started = Date.now();
    const text = await this.generateText(orgId, actorId, {
      feature: input.feature,
      prompt: `${input.prompt}\nRespond with JSON only.`,
      dataClasses: input.dataClasses,
      mode: input.mode ?? "hybrid",
      clientWebgpu: input.clientWebgpu ?? false,
    });
    if (!text.available) {
      return text;
    }
    if (text.deferred) {
      return { available: false, reason: "Structured output requires a server-side runtime." };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.text);
    } catch {
      await this.auditCall(orgId, actorId, input.feature, null, Date.now() - started, false, true);
      throw new BadGatewayException("Model output is not valid JSON.");
    }
    const data = this.validateStructured(parsed, input.schema);
    return { available: true, runtime: text.runtime, model: text.model, data };
  }

  async generateEmbedding(
    orgId: string,
    actorId: string,
    input: { feature: string; text: string; dataClasses: DataClass[]; mode?: ExecutionMode },
  ): Promise<
    | { available: true; runtime: RuntimeKind; model: string; embedding: number[] }
    | { available: false; reason: string }
  > {
    const started = Date.now();
    if (input.text.trim().length === 0) {
      throw new BadRequestException("text must not be empty.");
    }
    const resolved = this.resolve({
      feature: input.feature,
      dataClasses: input.dataClasses,
      mode: input.mode ?? "hybrid",
      clientWebgpu: false,
    });
    if (resolved === null || resolved.runtime === "webgpu") {
      await this.auditCall(
        orgId,
        actorId,
        input.feature,
        resolved,
        Date.now() - started,
        false,
        true,
      );
      return { available: false, reason: "No server-side embedding runtime is available." };
    }
    let text = input.text;
    if (resolved.runtime === "provider") {
      text = redactPersonal(text).redacted;
    }
    try {
      const embedding = await this.adapterFor(resolved.runtime).embed(resolved.model, text);
      await this.auditCall(
        orgId,
        actorId,
        input.feature,
        resolved,
        Date.now() - started,
        true,
        false,
      );
      return {
        available: true,
        runtime: resolved.runtime,
        model: resolved.model,
        embedding: embedding as number[],
      };
    } catch (error) {
      await this.auditCall(
        orgId,
        actorId,
        input.feature,
        resolved,
        Date.now() - started,
        false,
        true,
      );
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException("Embedding endpoint is unreachable.");
    }
  }

  async decide(
    orgId: string,
    actorId: string,
    input: {
      feature: string;
      question: string;
      questionType: QuestionType;
      options?: string[];
      dataClasses: DataClass[];
      mode?: ExecutionMode;
      temperature?: number;
    },
  ): Promise<DecideResult & { model: string; runtime: RuntimeKind; escalated: boolean }> {
    const started = Date.now();
    const config = this.config();
    const finish = async (
      result: DecideResult & { model: string; runtime: RuntimeKind },
      success: boolean,
    ): Promise<DecideResult & { model: string; runtime: RuntimeKind; escalated: boolean }> => {
      await this.auditCall(
        orgId,
        actorId,
        input.feature,
        {
          runtime: result.runtime,
          privacyLevel: privacyLevelFor(input.dataClasses),
          model: result.model,
        },
        Date.now() - started,
        success,
        result.escalated,
      );
      if (result.escalated) {
        this.metrics.recordEscalation();
      }
      return result;
    };
    if (!config.enabled) {
      return finish(
        {
          kind: "none",
          confidence: 0,
          escalated: true,
          threshold: 1,
          model: "disabled",
          runtime: "disabled",
        },
        false,
      );
    }
    if (input.question.trim().length === 0) {
      throw new BadRequestException("question must not be empty.");
    }
    const resolved = this.resolve({
      feature: input.feature,
      dataClasses: input.dataClasses,
      mode: input.mode ?? "hybrid",
      clientWebgpu: false,
    });
    if (resolved === null) {
      return finish(
        {
          kind: "none",
          confidence: 0,
          escalated: true,
          threshold: 1,
          model: "disabled",
          runtime: "disabled",
        },
        false,
      );
    }
    const adapter = buildDecisionAdapter(config);
    try {
      const answer = await adapter.decide({
        question: input.question,
        questionType: input.questionType,
        ...(input.options === undefined ? {} : { options: input.options }),
        dataClasses: input.dataClasses,
        redact: (text) => redactPersonal(text).redacted,
      });
      const result = applyDecisionThreshold(answer, input.questionType, input.temperature ?? 1);
      return finish({ ...result, model: adapter.model, runtime: resolved.runtime }, true);
    } catch (error) {
      this.metrics.recordUpstreamFailure(error);
      const escalated = applyDecisionThreshold(
        { kind: "none" as const, confidence: 0 },
        input.questionType,
      );
      return finish({ ...escalated, model: adapter.model, runtime: resolved.runtime }, false);
    }
  }

  async analyzeImage(
    orgId: string,
    actorId: string,
    input: {
      feature: string;
      prompt: string;
      image: { mediaType: string; base64: string };
      dataClasses: DataClass[];
      mode?: ExecutionMode;
    },
  ): Promise<
    | {
        available: true;
        runtime: RuntimeKind;
        model: string;
        analysis: { description: string; labels: string[] };
      }
    | { available: false; reason: string }
  > {
    const started = Date.now();
    if (input.prompt.trim().length === 0) {
      throw new BadRequestException("prompt must not be empty.");
    }
    if (!IMAGE_MEDIA_TYPES.includes(input.image.mediaType)) {
      throw new BadRequestException(`mediaType must be one of: ${IMAGE_MEDIA_TYPES.join(", ")}.`);
    }
    if (input.image.base64.length === 0 || input.image.base64.length > MAX_IMAGE_BASE64_CHARS) {
      throw new BadRequestException("image must be 1-5MB as base64.");
    }
    if (!BASE64_PATTERN.test(input.image.base64)) {
      throw new BadRequestException("image must be base64 encoded.");
    }
    const resolved = this.resolve({
      feature: input.feature,
      dataClasses: input.dataClasses,
      mode: input.mode ?? "hybrid",
      clientWebgpu: false,
    });
    if (resolved === null) {
      await this.auditCall(orgId, actorId, input.feature, null, Date.now() - started, false, true);
      return { available: false, reason: "No permitted vision runtime is available." };
    }
    const prompt =
      resolved.runtime === "provider" ? redactPersonal(input.prompt).redacted : input.prompt;
    try {
      const completion = await this.adapterFor(resolved.runtime).chat({
        model: resolved.model,
        maxTokens: 512,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `${prompt}\nRespond with JSON only.` },
              {
                type: "image_url",
                image_url: { url: `data:${input.image.mediaType};base64,${input.image.base64}` },
              },
            ],
          },
        ],
      });
      let parsed: unknown;
      try {
        parsed = JSON.parse(completion.text);
      } catch {
        throw new BadGatewayException("Vision output is not valid JSON.");
      }
      const analysis = this.validateStructured(parsed, VISION_SCHEMA);
      await this.auditCall(
        orgId,
        actorId,
        input.feature,
        resolved,
        Date.now() - started,
        true,
        false,
      );
      return {
        available: true,
        runtime: resolved.runtime,
        model: resolved.model,
        analysis: {
          description: String(analysis["description"] ?? ""),
          labels: Array.isArray(analysis["labels"])
            ? (analysis["labels"] as unknown[]).map((entry) => String(entry))
            : [],
        },
      };
    } catch (error) {
      await this.auditCall(
        orgId,
        actorId,
        input.feature,
        resolved,
        Date.now() - started,
        false,
        true,
      );
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException("Vision endpoint is unreachable.");
    }
  }

  async recordObservation(
    orgId: string,
    actorId: string,
    input: { modelId: string; questionType: string; confidence: number; correct: boolean },
  ) {
    if (typeof input.confidence !== "number" || input.confidence < 0 || input.confidence > 1) {
      throw new BadRequestException("confidence must be within [0, 1].");
    }
    if (typeof input.correct !== "boolean") {
      throw new BadRequestException("correct must be a boolean.");
    }
    const saved = await this.store.recordObservation({
      orgId,
      modelId: input.modelId,
      questionType: input.questionType,
      confidence: input.confidence,
      correct: input.correct,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "ai.observation_recorded",
        entityType: "AIDecisionObservation",
        entityId: saved.id,
        metadata: { modelId: input.modelId, questionType: input.questionType },
      }),
    );
    return saved;
  }

  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  async calibration(modelId: string, questionType: string) {
    const rows = await this.store.listObservations(modelId, questionType);
    const samples = rows.map((row) => ({ confidence: row.confidence, correct: row.correct }));
    const temperature = samples.length === 0 ? 1 : fitTemperature(samples);
    const calibrated = samples.map((sample) => ({
      confidence:
        samples.length === 0
          ? sample.confidence
          : ((): number => {
              const clamped = Math.min(0.999, Math.max(0.001, sample.confidence));
              const logit = Math.log(clamped / (1 - clamped));
              return Math.round((1 / (1 + Math.exp(-logit / temperature))) * 10000) / 10000;
            })(),
      correct: sample.correct,
    }));
    return {
      modelId,
      questionType,
      samples: samples.length,
      temperature,
      ece: expectedCalibrationError(samples),
      calibratedEce: expectedCalibrationError(calibrated),
    };
  }
}
