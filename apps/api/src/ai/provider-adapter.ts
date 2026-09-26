import type { AiConfig } from "@admin-alquiler/config";
import { postJson, UpstreamError } from "./transport";

export type ChatPart = { type: string; text?: string; image_url?: { url: string } };

export interface ChatRequest {
  model: string;
  messages: { role: string; content: string | ChatPart[] }[];
  maxTokens: number;
}

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface ChatCompletion {
  text: string;
  usage: TokenUsage;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function usageOf(body: unknown): TokenUsage {
  const usage = asRecord(asRecord(body)?.["usage"]);
  const prompt = usage?.["prompt_tokens"];
  const completion = usage?.["completion_tokens"];
  return {
    promptTokens: typeof prompt === "number" ? prompt : null,
    completionTokens: typeof completion === "number" ? completion : null,
  };
}

function endpointOf(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

/**
 * OpenAI-compatible text and embedding calls. Local and external providers share
 * this adapter, so a provider swap is configuration only.
 */
export class ProviderAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | null,
    private readonly config: Pick<AiConfig, "timeoutMs" | "maxRetries">,
  ) {}

  async chat(request: ChatRequest): Promise<ChatCompletion> {
    const body = await postJson(
      `${endpointOf(this.baseUrl)}/v1/chat/completions`,
      { model: request.model, messages: request.messages, max_tokens: request.maxTokens },
      this.authHeaders(),
      { timeoutMs: this.config.timeoutMs, maxRetries: this.config.maxRetries },
    );
    const choices = asRecord(body)?.["choices"];
    const first = Array.isArray(choices) ? asRecord(choices[0]) : null;
    const content = asRecord(first?.["message"])?.["content"];
    if (typeof content !== "string" || content.length === 0) {
      throw new UpstreamError("malformed", "Inference endpoint returned no text.");
    }
    return { text: content, usage: usageOf(body) };
  }

  async embed(model: string, input: string): Promise<number[]> {
    const body = await postJson(
      `${endpointOf(this.baseUrl)}/v1/embeddings`,
      { model, input },
      this.authHeaders(),
      { timeoutMs: this.config.timeoutMs, maxRetries: this.config.maxRetries },
    );
    const data = asRecord(body)?.["data"];
    const first = Array.isArray(data) ? asRecord(data[0]) : null;
    const embedding = first?.["embedding"];
    if (!Array.isArray(embedding) || !embedding.every((entry) => typeof entry === "number")) {
      throw new UpstreamError("malformed", "Embedding endpoint returned no vector.");
    }
    return embedding as number[];
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey === null ? {} : { Authorization: `Bearer ${this.apiKey}` };
  }
}
