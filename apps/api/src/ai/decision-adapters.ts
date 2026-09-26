import type { AiConfig } from "@admin-alquiler/config";
import type { DataClass, QuestionType } from "@admin-alquiler/ai";
import { postJson, UpstreamError, type TransportPolicy } from "./transport";

export interface DecisionRequest {
  question: string;
  questionType: QuestionType;
  options?: string[];
  dataClasses: DataClass[];
  /** Applied by the adapter for hosted providers, per §5 privacy rules. */
  redact: (text: string) => string;
}

export type DecisionAnswer =
  | { kind: "choice"; choice: string; confidence: number }
  | { kind: "score"; score: number; confidence: number }
  | { kind: "none"; confidence: number };

/**
 * Wire-compatible decision interface. A self-hosted model and a hosted API are
 * interchangeable by configuration alone; no business logic knows which is used.
 */
export interface DecisionAdapter {
  readonly name: string;
  readonly model: string;
  readonly hosted: boolean;
  decide(request: DecisionRequest): Promise<DecisionAnswer>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function parseAnswer(body: unknown, options: string[] | undefined): DecisionAnswer {
  const record = asRecord(body);
  if (!record) {
    throw new UpstreamError("malformed", "Decision endpoint returned no object.");
  }
  const confidence = record["confidence"];
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    throw new UpstreamError("malformed", "Decision confidence must be a number.");
  }
  if (confidence < 0 || confidence > 1) {
    throw new UpstreamError("malformed", "Decision confidence must be within [0, 1].");
  }
  const choice = record["choice"];
  const score = record["score"];
  if (typeof choice === "string" && typeof score === "number") {
    throw new UpstreamError("malformed", "Decision must return either choice or score.");
  }
  if (typeof choice === "string") {
    if (options !== undefined && !options.includes(choice)) {
      throw new UpstreamError("malformed", "Decision choice is outside the allowed options.");
    }
    return { kind: "choice", choice, confidence };
  }
  if (typeof score === "number") {
    if (!Number.isFinite(score)) {
      throw new UpstreamError("malformed", "Decision score must be a finite number.");
    }
    return { kind: "score", score, confidence };
  }
  return { kind: "none", confidence };
}

function payload(
  model: string,
  request: DecisionRequest,
  hosted: boolean,
): Record<string, unknown> {
  return {
    model,
    question: hosted ? request.redact(request.question) : request.question,
    questionType: request.questionType,
    ...(request.options === undefined ? {} : { options: request.options }),
  };
}

export class SelfHostedDecisionAdapter implements DecisionAdapter {
  readonly name = "laya";
  readonly hosted = false;
  readonly model: string;

  constructor(
    private readonly baseUrl: string,
    model: string,
    private readonly policy: TransportPolicy,
  ) {
    this.model = model;
  }

  async decide(request: DecisionRequest): Promise<DecisionAnswer> {
    const body = await postJson(
      `${this.baseUrl.replace(/\/$/, "")}/decide`,
      payload(this.model, request, false),
      {},
      this.policy,
    );
    return parseAnswer(body, request.options);
  }
}

export class HostedDecisionAdapter implements DecisionAdapter {
  readonly name = "jev";
  readonly hosted = true;
  readonly model: string;

  constructor(
    private readonly baseUrl: string,
    model: string,
    private readonly apiKey: string | null,
    private readonly policy: TransportPolicy,
  ) {
    this.model = model;
  }

  async decide(request: DecisionRequest): Promise<DecisionAnswer> {
    const body = await postJson(
      `${this.baseUrl.replace(/\/$/, "")}/v1/decide`,
      payload("jev", request, true),
      this.apiKey === null ? {} : { Authorization: `Bearer ${this.apiKey}` },
      this.policy,
    );
    return parseAnswer(body, request.options);
  }
}

export function buildDecisionAdapter(config: AiConfig): DecisionAdapter {
  const policy: TransportPolicy = { timeoutMs: config.timeoutMs, maxRetries: config.maxRetries };
  return config.decisionProvider === "jev"
    ? new HostedDecisionAdapter(
        config.decisionBaseUrl,
        config.decisionModel,
        config.decisionApiKey,
        policy,
      )
    : new SelfHostedDecisionAdapter(config.decisionBaseUrl, config.decisionModel, policy);
}
