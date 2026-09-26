import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { buildAuditEvent } from "@admin-alquiler/domain";
import { requiresHumanConfirmation, type DataClass } from "@admin-alquiler/ai";
import { AiService } from "../ai.service";
import { AI_SUGGESTION_STORE } from "./tokens";
import type { AiSuggestionStore, SuggestionRow, SuggestionStatus } from "./store";
import {
  communicationPrompt,
  classifyPrompt,
  DEFAULT_LOCALE,
  draftPrompt,
  extractPrompt,
  isLocale,
  summarizePrompt,
  visionPrompt,
  type Locale,
} from "./prompts";
import {
  COMPLAINT_TYPES,
  FEATURES,
  MAINTENANCE_CATEGORIES,
  URGENCY_LEVELS,
  type FeatureKey,
} from "./schemas";

export type FeatureOutcome =
  { available: true; suggestion: SuggestionRow } | { available: false; reason: string };

function parseText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new BadRequestException(`${field} must be 1-${max} characters.`);
  }
  return value;
}

function parseLocale(value: unknown): Locale {
  if (value === undefined) {
    return DEFAULT_LOCALE;
  }
  if (typeof value !== "string" || !isLocale(value)) {
    throw new BadRequestException("locale must be es-CO or en-US.");
  }
  return value;
}

function parseFields(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException("fields must be an object of strings.");
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string" || entry.length > 2000) {
      throw new BadRequestException("fields must be an object of strings.");
    }
    out[key] = entry;
  }
  return out;
}

@Injectable()
export class AiFeaturesService {
  constructor(
    @Inject(AI_SUGGESTION_STORE) private readonly store: AiSuggestionStore,
    private readonly ai: AiService,
  ) {}

  private classesFor(feature: FeatureKey): DataClass[] {
    return [...FEATURES[feature].dataClasses];
  }

  private async record(input: {
    orgId: string;
    actorId: string;
    feature: FeatureKey;
    payload: Record<string, unknown>;
    confidence: number | null;
    escalated: boolean;
    runtime: string | null;
    model: string | null;
    action?: string;
  }): Promise<SuggestionRow> {
    const definition = FEATURES[input.feature];
    const action = input.action ?? definition.action;
    const decision = requiresHumanConfirmation({
      feature: input.feature,
      dataClasses: definition.dataClasses,
      escalated: input.escalated,
      ...(action === undefined ? {} : { action }),
    });
    const suggestion = await this.store.create({
      orgId: input.orgId,
      actorId: input.actorId,
      feature: input.feature,
      payload: input.payload,
      confidence: input.confidence,
      requiresConfirmation: decision.requiresConfirmation,
      sourceRuntime: input.runtime,
      sourceModel: input.model,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId: input.orgId,
        actorId: input.actorId,
        action: "ai.suggestion_created",
        entityType: "AISuggestion",
        entityId: suggestion.id,
        metadata: {
          feature: input.feature,
          requiresConfirmation: decision.requiresConfirmation,
          runtime: input.runtime,
        },
      }),
    );
    return suggestion;
  }

  async draft(
    orgId: string,
    actorId: string,
    input: { documentType: string; fields: Record<string, string>; locale?: string },
  ): Promise<FeatureOutcome> {
    const documentType = parseText(input.documentType, "documentType", 80);
    const locale = parseLocale(input.locale);
    const result = await this.ai.generateText(orgId, actorId, {
      feature: "document-draft",
      prompt: draftPrompt({ locale, documentType, fields: parseFields(input.fields) }),
      dataClasses: this.classesFor("document-draft"),
    });
    if (!result.available) {
      return { available: false, reason: result.reason };
    }
    if (result.deferred) {
      return { available: false, reason: "Drafting requires a server-side runtime." };
    }
    const suggestion = await this.record({
      orgId,
      actorId,
      feature: "document-draft",
      payload: { text: result.text, documentType, locale },
      confidence: null,
      escalated: false,
      runtime: result.runtime,
      model: result.model,
    });
    return { available: true, suggestion };
  }

  async assistCommunication(
    orgId: string,
    actorId: string,
    input: { recipient: string; purpose: string; tone?: string; locale?: string },
  ): Promise<FeatureOutcome> {
    const locale = parseLocale(input.locale);
    const result = await this.ai.generateText(orgId, actorId, {
      feature: "communication-assist",
      prompt: communicationPrompt({
        locale,
        recipient: parseText(input.recipient, "recipient", 200),
        purpose: parseText(input.purpose, "purpose", 2000),
        ...(input.tone === undefined ? {} : { tone: parseText(input.tone, "tone", 80) }),
      }),
      dataClasses: this.classesFor("communication-assist"),
    });
    if (!result.available) {
      return { available: false, reason: result.reason };
    }
    if (result.deferred) {
      return { available: false, reason: "Drafting requires a server-side runtime." };
    }
    const suggestion = await this.record({
      orgId,
      actorId,
      feature: "communication-assist",
      payload: { text: result.text, locale },
      confidence: null,
      escalated: false,
      runtime: result.runtime,
      model: result.model,
    });
    return { available: true, suggestion };
  }

  async summarize(
    orgId: string,
    actorId: string,
    input: { text: string; maxSentences?: number; locale?: string },
  ): Promise<FeatureOutcome> {
    const locale = parseLocale(input.locale);
    const text = parseText(input.text, "text", 20000);
    if (
      input.maxSentences !== undefined &&
      (!Number.isInteger(input.maxSentences) || input.maxSentences < 1 || input.maxSentences > 20)
    ) {
      throw new BadRequestException("maxSentences must be an integer between 1 and 20.");
    }
    const result = await this.ai.generateText(orgId, actorId, {
      feature: "summarization",
      prompt: summarizePrompt({
        locale,
        text,
        ...(input.maxSentences === undefined ? {} : { maxSentences: input.maxSentences }),
      }),
      dataClasses: this.classesFor("summarization"),
    });
    if (!result.available) {
      return { available: false, reason: result.reason };
    }
    if (result.deferred) {
      return { available: false, reason: "Summarization requires a server-side runtime." };
    }
    const suggestion = await this.record({
      orgId,
      actorId,
      feature: "summarization",
      payload: { text: result.text, locale },
      confidence: null,
      escalated: false,
      runtime: result.runtime,
      model: result.model,
    });
    return { available: true, suggestion };
  }

  async extract(
    orgId: string,
    actorId: string,
    input: { text: string; locale?: string },
  ): Promise<FeatureOutcome> {
    const locale = parseLocale(input.locale);
    const definition = FEATURES.extraction;
    const result = await this.ai.generateStructuredOutput(orgId, actorId, {
      feature: "extraction",
      prompt: extractPrompt({ locale, text: parseText(input.text, "text", 20000) }),
      schema: definition.schema as Record<string, unknown>,
      dataClasses: this.classesFor("extraction"),
    });
    if (!result.available) {
      return { available: false, reason: result.reason };
    }
    const suggestion = await this.record({
      orgId,
      actorId,
      feature: "extraction",
      payload: { ...result.data, locale },
      confidence: null,
      escalated: false,
      runtime: result.runtime,
      model: result.model,
    });
    return { available: true, suggestion };
  }

  async classify(
    orgId: string,
    actorId: string,
    input: { text: string; complaint?: boolean; locale?: string },
  ): Promise<FeatureOutcome> {
    const locale = parseLocale(input.locale);
    const definition = FEATURES.classification;
    const result = await this.ai.generateStructuredOutput(orgId, actorId, {
      feature: "classification",
      prompt: classifyPrompt({
        locale,
        text: parseText(input.text, "text", 8000),
        categories: MAINTENANCE_CATEGORIES,
        urgencies: URGENCY_LEVELS,
        ...(input.complaint === true ? { complaintTypes: COMPLAINT_TYPES } : {}),
      }),
      schema: definition.schema as Record<string, unknown>,
      dataClasses: this.classesFor("classification"),
    });
    if (!result.available) {
      return { available: false, reason: result.reason };
    }
    const suggestion = await this.record({
      orgId,
      actorId,
      feature: "classification",
      payload: { ...result.data, locale },
      confidence: null,
      escalated: false,
      runtime: result.runtime,
      model: result.model,
    });
    return { available: true, suggestion };
  }

  async analyzeImage(
    orgId: string,
    actorId: string,
    input: { mediaType: string; base64: string; instruction?: string; locale?: string },
  ): Promise<FeatureOutcome> {
    const locale = parseLocale(input.locale);
    const result = await this.ai.analyzeImage(orgId, actorId, {
      feature: "vision",
      prompt: visionPrompt({
        locale,
        ...(input.instruction === undefined
          ? {}
          : { instruction: parseText(input.instruction, "instruction", 500) }),
      }),
      image: { mediaType: input.mediaType, base64: input.base64 },
      dataClasses: this.classesFor("vision"),
    });
    if (!result.available) {
      return { available: false, reason: result.reason };
    }
    const suggestion = await this.record({
      orgId,
      actorId,
      feature: "vision",
      payload: { ...result.analysis, locale },
      confidence: null,
      escalated: false,
      runtime: result.runtime,
      model: result.model,
    });
    return { available: true, suggestion };
  }

  /**
   * Bounded-answer triage. The answer is a suggestion only: the caller still confirms the
   * resulting business action, and a low-confidence answer is escalated to a human.
   */
  async triage(
    orgId: string,
    actorId: string,
    input: {
      question: string;
      questionType: "triage" | "proof-match" | "dunning" | "generic";
      options?: string[];
    },
  ): Promise<FeatureOutcome> {
    const decision = await this.ai.decide(orgId, actorId, {
      feature: "decide-triage",
      question: parseText(input.question, "question", 2000),
      questionType: input.questionType,
      dataClasses: ["INTERNAL"],
      ...(input.options === undefined ? {} : { options: input.options }),
    });
    if (decision.runtime === "disabled") {
      return { available: false, reason: "AI is disabled or no permitted runtime is available." };
    }
    const suggestion = await this.record({
      orgId,
      actorId,
      feature: "classification",
      payload: {
        kind: decision.kind,
        choice: decision.choice ?? null,
        score: decision.score ?? null,
        threshold: decision.threshold,
        escalated: decision.escalated,
      },
      confidence: decision.confidence,
      escalated: decision.escalated,
      runtime: decision.runtime,
      model: decision.model,
    });
    return { available: true, suggestion };
  }

  async list(
    orgId: string,
    filter: { feature?: string; status?: SuggestionStatus },
  ): Promise<SuggestionRow[]> {
    if (
      filter.feature !== undefined &&
      !Object.prototype.hasOwnProperty.call(FEATURES, filter.feature)
    ) {
      throw new BadRequestException("Unknown feature.");
    }
    return this.store.list(orgId, filter);
  }

  async get(orgId: string, id: string): Promise<SuggestionRow> {
    const found = await this.store.find(id, orgId);
    if (!found) {
      throw new NotFoundException("Suggestion not found.");
    }
    return found;
  }

  private async decide(
    orgId: string,
    actorId: string,
    id: string,
    status: SuggestionStatus,
  ): Promise<SuggestionRow> {
    const existing = await this.store.find(id, orgId);
    if (!existing) {
      throw new NotFoundException("Suggestion not found.");
    }
    const updated = await this.store.decide(id, orgId, status, actorId);
    if (!updated) {
      throw new ConflictException("Suggestion was already decided.");
    }
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: status === "CONFIRMED" ? "ai.suggestion_confirmed" : "ai.suggestion_rejected",
        entityType: "AISuggestion",
        entityId: updated.id,
        metadata: { feature: updated.feature, from: existing.status, to: status },
      }),
    );
    return updated;
  }

  confirm(orgId: string, actorId: string, id: string): Promise<SuggestionRow> {
    return this.decide(orgId, actorId, id, "CONFIRMED");
  }

  reject(orgId: string, actorId: string, id: string): Promise<SuggestionRow> {
    return this.decide(orgId, actorId, id, "REJECTED");
  }
}
