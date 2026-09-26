import { resolvePermittedRuntime, type RuntimeKind } from "@admin-alquiler/ai";
import {
  accuracy,
  distribution,
  ece,
  fieldAccuracy,
  forbiddenRate,
  hallucinationRate,
  keywordRecall,
  openEndedRate,
  temperatureFor,
  type ClassificationCase,
  type FallbackScenario,
  type StructuredCase,
  type TextCase,
} from "./metrics";
import { evaluateCalibrationGate, type Observation } from "./calibration-gate";

export interface EvaluationInput {
  textCases: TextCase[];
  structuredCases: StructuredCase[];
  classificationCases: ClassificationCase[];
  latenciesMs: number[];
  memorySamplesMb: number[];
  fallbackScenarios: FallbackScenario[];
  observations: Observation[];
  questionType: "triage" | "proof-match" | "dunning" | "generic";
  webgpuAvailable: boolean;
}

export interface EvaluationReport {
  spanishQuality: number;
  englishQuality: number;
  structuredExtraction: number;
  classification: number;
  classificationOutsideAllowedSet: number;
  summarization: number;
  hallucinationRate: number;
  forbiddenContentRate: number;
  latencyMs: ReturnType<typeof distribution>;
  memoryMb: ReturnType<typeof distribution>;
  webgpuAvailable: boolean;
  fallbackCorrect: boolean;
  fallbackFailures: string[];
  calibration: ReturnType<typeof evaluateCalibrationGate>;
  ece: number;
  temperature: number | null;
}

function quality(cases: TextCase[]): number {
  if (cases.length === 0) {
    return 0;
  }
  const recall = keywordRecall(cases);
  const hallucination = hallucinationRate(cases);
  return Math.max(0, Math.round((recall - hallucination) * 10000) / 10000);
}

function checkFallback(scenario: FallbackScenario): boolean {
  const resolved = resolvePermittedRuntime(
    scenario.mode,
    scenario.dataClasses,
    scenario.priority,
    scenario.available,
  );
  return resolved === scenario.expected;
}

export function evaluate(input: EvaluationInput): EvaluationReport {
  const spanish = input.textCases.filter((entry) => entry.locale === "es-CO");
  const english = input.textCases.filter((entry) => entry.locale === "en-US");
  const failures = input.fallbackScenarios
    .filter((scenario) => !checkFallback(scenario))
    .map((scenario) => scenario.id);
  return {
    spanishQuality: quality(spanish),
    englishQuality: quality(english),
    structuredExtraction: fieldAccuracy(input.structuredCases),
    classification: accuracy(
      input.classificationCases.map((entry) => ({
        expected: entry.expected,
        actual: entry.actual,
      })),
    ),
    classificationOutsideAllowedSet: openEndedRate(input.classificationCases),
    summarization: keywordRecall(input.textCases),
    hallucinationRate: hallucinationRate(input.textCases),
    forbiddenContentRate: forbiddenRate(input.textCases),
    latencyMs: distribution(input.latenciesMs),
    memoryMb: distribution(input.memorySamplesMb),
    webgpuAvailable: input.webgpuAvailable,
    fallbackCorrect: failures.length === 0,
    fallbackFailures: failures,
    calibration: evaluateCalibrationGate(input.questionType, input.observations),
    ece: ece(
      input.observations.map((entry) => ({ confidence: entry.confidence, correct: entry.correct })),
    ),
    temperature: temperatureFor(
      input.observations.map((entry) => ({ confidence: entry.confidence, correct: entry.correct })),
    ),
  };
}

export const DEFAULT_FALLBACK_SCENARIOS: FallbackScenario[] = [
  {
    id: "financial-provider-requested",
    dataClasses: ["FINANCIAL"],
    mode: "provider",
    priority: ["provider", "local", "webgpu", "disabled"],
    available: { webgpu: true, local: true, provider: true },
    expected: "disabled",
  },
  {
    id: "internal-prefers-local",
    dataClasses: ["INTERNAL"],
    mode: "hybrid",
    priority: ["webgpu", "local", "provider", "disabled"],
    available: { webgpu: false, local: true, provider: true },
    expected: "local",
  },
  {
    id: "public-uses-webgpu",
    dataClasses: ["PUBLIC"],
    mode: "hybrid",
    priority: ["webgpu", "local", "provider", "disabled"],
    available: { webgpu: true, local: true, provider: true },
    expected: "webgpu",
  },
  {
    id: "nothing-available",
    dataClasses: ["PUBLIC"],
    mode: "hybrid",
    priority: ["webgpu", "local", "provider", "disabled"],
    available: { webgpu: false, local: false, provider: false },
    expected: "disabled",
  },
  {
    id: "personal-refuses-provider",
    dataClasses: ["PERSONAL"],
    mode: "hybrid",
    priority: ["provider", "local", "disabled"],
    available: { webgpu: false, local: true, provider: true },
    expected: "local",
  },
];

export function isRuntimeKind(value: string): value is RuntimeKind {
  return ["disabled", "webgpu", "local", "provider"].includes(value);
}
