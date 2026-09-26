import type { DecideOutput, DecideResult, ExecutionMode, QuestionType, RuntimeKind } from "./types";
import { DECIDE_THRESHOLDS } from "./types";

export function resolveRuntime(
  mode: ExecutionMode,
  priority: RuntimeKind[],
  available: { webgpu: boolean; local: boolean; provider: boolean },
): RuntimeKind {
  if (mode === "disabled") {
    return "disabled";
  }
  if (mode === "webgpu") {
    return available.webgpu ? "webgpu" : "disabled";
  }
  if (mode === "local") {
    return available.local ? "local" : "disabled";
  }
  if (mode === "provider") {
    return available.provider ? "provider" : "disabled";
  }
  for (const runtime of priority) {
    if (runtime === "webgpu" && available.webgpu) {
      return "webgpu";
    }
    if (runtime === "local" && available.local) {
      return "local";
    }
    if (runtime === "provider" && available.provider) {
      return "provider";
    }
    if (runtime === "disabled") {
      return "disabled";
    }
  }
  return "disabled";
}

export function defaultPriority(): RuntimeKind[] {
  return ["webgpu", "local", "provider", "disabled"];
}

export function applyDecisionThreshold(
  output: DecideOutput,
  questionType: QuestionType,
  temperature = 1,
): DecideResult {
  const threshold = DECIDE_THRESHOLDS[questionType] ?? DECIDE_THRESHOLDS.generic;
  const calibrated = calibrateConfidence(output.confidence, temperature);
  if (calibrated < threshold) {
    return { ...output, confidence: calibrated, escalated: true, threshold };
  }
  return { ...output, confidence: calibrated, escalated: false, threshold };
}

export function calibrateConfidence(confidence: number, temperature: number): number {
  if (!(temperature > 0) || !Number.isFinite(temperature)) {
    throw new Error("temperature must be a positive number.");
  }
  const clamped = Math.min(0.999, Math.max(0.001, confidence));
  const logit = Math.log(clamped / (1 - clamped));
  const scaled = 1 / (1 + Math.exp(-logit / temperature));
  return Math.round(scaled * 10000) / 10000;
}

export interface CalibrationSample {
  confidence: number;
  correct: boolean;
}

export function expectedCalibrationError(samples: CalibrationSample[], bins = 10): number {
  if (samples.length === 0) {
    return 0;
  }
  const edges = Array.from({ length: bins + 1 }, (_, index) => index / bins);
  let weighted = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    const low = edges[bin] as number;
    const high = edges[bin + 1] as number;
    const inBin = samples.filter(
      (sample) =>
        sample.confidence > low &&
        (sample.confidence <= high || (bin === 0 && sample.confidence === 0)),
    );
    if (inBin.length === 0) {
      continue;
    }
    const accuracy = inBin.filter((sample) => sample.correct).length / inBin.length;
    const meanConfidence =
      inBin.reduce((total, sample) => total + sample.confidence, 0) / inBin.length;
    weighted += (inBin.length / samples.length) * Math.abs(accuracy - meanConfidence);
  }
  return Math.round(weighted * 10000) / 10000;
}

export function fitTemperature(samples: CalibrationSample[]): number {
  if (samples.length === 0) {
    throw new Error("Cannot fit temperature without samples.");
  }
  let best = 1;
  let bestEce = Number.POSITIVE_INFINITY;
  for (let candidate = 0.2; candidate <= 5.01; candidate += 0.1) {
    const temperature = Math.round(candidate * 10) / 10;
    const scaled = samples.map((sample) => ({
      confidence: calibrateConfidence(sample.confidence, temperature),
      correct: sample.correct,
    }));
    const ece = expectedCalibrationError(scaled);
    if (ece < bestEce) {
      bestEce = ece;
      best = temperature;
    }
  }
  return best;
}
