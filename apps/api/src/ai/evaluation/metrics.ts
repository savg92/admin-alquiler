import {
  expectedCalibrationError,
  fitTemperature,
  privacyLevelFor,
  type CalibrationSample,
  type DataClass,
  type ExecutionMode,
  type RuntimeKind,
} from "@admin-alquiler/ai";

export interface TextCase {
  id: string;
  locale: "es-CO" | "en-US";
  source: string;
  expected?: string[];
  forbidden?: string[];
  output: string;
}

export interface StructuredCase {
  id: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
}

export interface ClassificationCase {
  id: string;
  allowed: readonly string[];
  actual: string;
  expected: string;
}

export interface LatencySample {
  latencyMs: number;
}

export interface FallbackScenario {
  id: string;
  dataClasses: DataClass[];
  mode: ExecutionMode;
  priority: RuntimeKind[];
  available: { webgpu: boolean; local: boolean; provider: boolean };
  expected: RuntimeKind;
}

const NUMBER_PATTERN = /-?\d[\d.,]*/g;
const ENTITY_PATTERN = /\b[A-ZÁÉÍÓÚÑ][\p{L}]{2,}\b/gu;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[.\s]/g, "");
}

export function accuracy(cases: { expected: string; actual: string }[]): number {
  if (cases.length === 0) {
    return 0;
  }
  const hits = cases.filter((entry) => entry.expected === entry.actual).length;
  return round(hits / cases.length);
}

export function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** A hallucination is a number or named entity in the output that is absent from the source. */
export function hallucinationRate(cases: TextCase[]): number {
  if (cases.length === 0) {
    return 0;
  }
  let hallucinations = 0;
  for (const entry of cases) {
    const sourceNumbers = new Set((entry.source.match(NUMBER_PATTERN) ?? []).map(normalize));
    const sourceEntities = new Set((entry.source.match(ENTITY_PATTERN) ?? []).map(normalize));
    const outputNumbers = (entry.output.match(NUMBER_PATTERN) ?? []).map(normalize);
    const outputEntities = (entry.output.match(ENTITY_PATTERN) ?? []).map(normalize);
    const inventedNumber = outputNumbers.some((value) => !sourceNumbers.has(value));
    const inventedEntity = outputEntities.some(
      (value) => !sourceEntities.has(value) && !STOPWORD_ENTITIES.has(value),
    );
    if (inventedNumber || inventedEntity) {
      hallucinations += 1;
    }
  }
  return round(hallucinations / cases.length);
}

const STOPWORD_ENTITIES = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "de",
  "del",
  "que",
  "para",
  "con",
  "por",
  "the",
  "and",
  "for",
  "with",
]);

export function keywordRecall(cases: TextCase[]): number {
  if (cases.length === 0) {
    return 0;
  }
  let total = 0;
  let matched = 0;
  for (const entry of cases) {
    for (const keyword of entry.expected ?? []) {
      total += 1;
      if (normalize(entry.output).includes(normalize(keyword))) {
        matched += 1;
      }
    }
  }
  return total === 0 ? 0 : round(matched / total);
}

export function forbiddenRate(cases: TextCase[]): number {
  if (cases.length === 0) {
    return 0;
  }
  const leaked = cases.filter((entry) =>
    (entry.forbidden ?? []).some((term) => normalize(entry.output).includes(normalize(term))),
  ).length;
  return round(leaked / cases.length);
}

export function fieldAccuracy(cases: StructuredCase[]): number {
  if (cases.length === 0) {
    return 0;
  }
  let total = 0;
  let correct = 0;
  for (const entry of cases) {
    for (const [key, value] of Object.entries(entry.expected)) {
      total += 1;
      if (JSON.stringify(entry.actual[key]) === JSON.stringify(value)) {
        correct += 1;
      }
    }
  }
  return total === 0 ? 0 : round(correct / total);
}

export function openEndedRate(cases: ClassificationCase[]): number {
  if (cases.length === 0) {
    return 0;
  }
  const outside = cases.filter((entry) => !entry.allowed.includes(entry.actual)).length;
  return round(outside / cases.length);
}

export interface Distribution {
  count: number;
  min: number;
  max: number;
  mean: number;
  p95: number;
}

export function distribution(values: number[]): Distribution {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p95: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return {
    count: sorted.length,
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    mean: round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    p95: round(sorted[index] as number),
  };
}

export function ece(samples: CalibrationSample[]): number {
  return expectedCalibrationError(samples);
}

export function temperatureFor(samples: CalibrationSample[]): number | null {
  if (samples.length === 0) {
    return null;
  }
  return fitTemperature(samples);
}

export { privacyLevelFor };
