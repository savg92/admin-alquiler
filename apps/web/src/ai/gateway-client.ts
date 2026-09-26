import {
  probeWebGpu,
  shouldUseWebGpu,
  type CapabilityResult,
  type GpuLike,
  type MemoryInfoLike,
} from "./webgpu";
import { ModelCache } from "./model-cache";

export interface TextRequest {
  feature: string;
  prompt: string;
  dataClasses: string[];
  maxTokens?: number;
}

export type RunResult =
  | { source: "server"; text: string; model: string }
  | { source: "webgpu"; text: string; model: string }
  | { source: "none"; reason: string };

export type InferenceRunner = (input: {
  prompt: string;
  model: string;
  maxTokens: number;
}) => Promise<string>;

export interface GatewayClientOptions {
  baseUrl: string;
  authHeaders: () => Record<string, string>;
  gpu: GpuLike | undefined;
  memory: MemoryInfoLike | undefined;
  cache: ModelCache;
  runInference: InferenceRunner;
}

interface TextResponse {
  available: boolean;
  runtime?: string;
  model?: string;
  text?: string;
  deferred?: boolean;
  payload?: { prompt: string; maxTokens: number };
  reason?: string;
}

export class AiGatewayClient {
  constructor(private readonly options: GatewayClientOptions) {}

  async capability(): Promise<CapabilityResult> {
    return probeWebGpu(this.options.gpu, this.options.memory);
  }

  private async post(path: string, body: unknown): Promise<TextResponse> {
    const response = await fetch(`${this.options.baseUrl}/api/v1/ai/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.options.authHeaders() },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { available: false, reason: `Request failed with status ${response.status}.` };
    }
    return (await response.json()) as TextResponse;
  }

  async run(request: TextRequest): Promise<RunResult> {
    const capability = await this.capability();
    const clientWebgpu = shouldUseWebGpu(capability);
    const response = await this.post("text", {
      feature: request.feature,
      prompt: request.prompt,
      dataClasses: request.dataClasses,
      clientWebgpu,
      ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
    });
    if (!response.available) {
      return { source: "none", reason: response.reason ?? "AI is unavailable." };
    }
    if (response.deferred !== true) {
      return { source: "server", text: response.text ?? "", model: response.model ?? "unknown" };
    }
    const payload = response.payload ?? { prompt: request.prompt, maxTokens: 512 };
    const model = response.model ?? "webgpu";
    if (!this.options.cache.isComplete(model)) {
      return {
        source: "none",
        reason: "Model is not downloaded yet; run the download before generating on-device.",
      };
    }
    let text: string;
    try {
      text = await this.options.runInference({
        prompt: payload.prompt,
        model,
        maxTokens: payload.maxTokens,
      });
    } catch {
      return { source: "none", reason: "On-device inference failed." };
    }
    const validated = await this.post("complete", {
      feature: request.feature,
      result: text,
      model,
    });
    if (typeof validated.text !== "string") {
      return { source: "none", reason: "On-device result was rejected by the server." };
    }
    return { source: "webgpu", text: validated.text, model };
  }
}
