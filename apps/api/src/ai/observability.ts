import { Injectable } from "@nestjs/common";
import type { PrivacyLevel } from "@admin-alquiler/ai";

/**
 * Safe per-call metadata only (PHASE-2 §12).
 *
 * The shape deliberately has no prompt, response, document or image field, so a
 * sensitive payload cannot be recorded here even by mistake. Anything needed to
 * explain a decision belongs in the audit trail as an ID, never as content.
 */
export interface AiCallRecord {
  feature: string;
  runtime: string;
  model: string;
  provider: string;
  privacyMode: PrivacyLevel | "unknown";
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  fallback: boolean;
  success: boolean;
}

export interface AiLatencyStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p95: number;
}

export interface AiMetricsSnapshot {
  window: number;
  total: number;
  success: number;
  failure: number;
  fallbacks: number;
  escalations: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: AiLatencyStats;
  byFeature: Record<string, { calls: number; failures: number; fallbacks: number }>;
  byRuntime: Record<string, number>;
  byModel: Record<string, number>;
  byProvider: Record<string, number>;
}

const WINDOW = 500;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] as number;
}

function bump(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

@Injectable()
export class AiObservabilityService {
  private readonly window: AiCallRecord[] = [];
  private escalations = 0;

  record(entry: AiCallRecord): void {
    this.window.push(entry);
    if (this.window.length > WINDOW) {
      this.window.splice(0, this.window.length - WINDOW);
    }
  }

  /** A `decide` answer below threshold was routed to a human instead of auto-advancing. */
  recordEscalation(): void {
    this.escalations += 1;
  }

  snapshot(): AiMetricsSnapshot {
    const calls = [...this.window];
    const latencies = calls.map((call) => call.latencyMs).sort((a, b) => a - b);
    const byFeature: AiMetricsSnapshot["byFeature"] = {};
    const byRuntime: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    let success = 0;
    let fallbacks = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    for (const call of calls) {
      const feature = (byFeature[call.feature] ??= { calls: 0, failures: 0, fallbacks: 0 });
      feature.calls += 1;
      if (call.success) {
        success += 1;
      } else {
        feature.failures += 1;
      }
      if (call.fallback) {
        fallbacks += 1;
        feature.fallbacks += 1;
      }
      bump(byRuntime, call.runtime);
      bump(byModel, call.model);
      bump(byProvider, call.provider);
      promptTokens += call.promptTokens ?? 0;
      completionTokens += call.completionTokens ?? 0;
    }
    return {
      window: calls.length,
      total: calls.length,
      success,
      failure: calls.length - success,
      fallbacks,
      escalations: this.escalations,
      promptTokens,
      completionTokens,
      latencyMs: {
        count: latencies.length,
        min: latencies.length === 0 ? 0 : (latencies[0] as number),
        max: latencies.length === 0 ? 0 : (latencies[latencies.length - 1] as number),
        mean:
          latencies.length === 0
            ? 0
            : round(latencies.reduce((total, value) => total + value, 0) / latencies.length),
        p95: round(percentile(latencies, 0.95)),
      },
      byFeature,
      byRuntime,
      byModel,
      byProvider,
    };
  }

  reset(): void {
    this.window.length = 0;
    this.escalations = 0;
  }
}
