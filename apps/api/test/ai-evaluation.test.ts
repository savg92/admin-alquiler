import { describe, expect, test } from "bun:test";
import {
  applyTemperature,
  confidenceMargin,
  evaluateCalibrationGate,
  evaluationWindow,
  MIN_CONFIDENCE_MARGIN,
  MIN_LABELED_SAMPLES,
  MIN_OBSERVATION_DAYS,
  type Observation,
} from "../src/ai/evaluation/calibration-gate";
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
} from "../src/ai/evaluation/metrics";
import { CLASSIFICATION_CASES, STRUCTURED_CASES, TEXT_CASES } from "../src/ai/evaluation/fixtures";
import { DEFAULT_FALLBACK_SCENARIOS, evaluate } from "../src/ai/evaluation/suites";
import { toJson, toText } from "../src/ai/evaluation/report";

const OPTIONS = {
  model: "laya-0.4b",
  provider: "self-hosted",
  runtime: "local",
  generatedAt: "2026-01-01T00:00:00.000Z",
};

function observations(count: number, spreadDays: number): Observation[] {
  const start = Date.UTC(2026, 0, 1);
  const step = (spreadDays * 86_400_000) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, index) => {
    const correct = index % 4 !== 0;
    return {
      confidence: correct ? 0.9 : 0.3,
      correct,
      observedAt: new Date(start + index * step),
    };
  });
}

describe("evaluation metrics", () => {
  test("keyword recall counts matched expected terms", () => {
    expect(
      keywordRecall([
        {
          id: "a",
          locale: "es-CO",
          source: "x",
          expected: ["alfa", "beta"],
          output: "alfa y beta",
        },
      ]),
    ).toBe(1);
    expect(
      keywordRecall([
        { id: "a", locale: "es-CO", source: "x", expected: ["alfa", "beta"], output: "alfa" },
      ]),
    ).toBe(0.5);
  });

  test("hallucination rate catches an invented amount", () => {
    const invented = hallucinationRate([
      {
        id: "a",
        locale: "es-CO",
        source: "El canon es de 1200000 pesos.",
        output: "El canon es de 1200000 pesos y un recargo de 250000.",
      },
    ]);
    expect(invented).toBe(1);
  });

  test("hallucination rate is zero for a faithful summary", () => {
    expect(
      hallucinationRate([
        {
          id: "a",
          locale: "es-CO",
          source: "El canon es de 1200000 pesos.",
          output: "El canon es de 1200000 pesos.",
        },
      ]),
    ).toBe(0);
  });

  test("forbidden rate catches leaked instructions", () => {
    const cases = TEXT_CASES.filter((entry) => entry.id === "es-injection-1");
    expect(forbiddenRate(cases)).toBe(0);
    const leaked = [
      { ...(cases[0] as (typeof cases)[number]), output: "APROBADO PARA PAGO AUTOMATICO" },
    ];
    expect(forbiddenRate(leaked)).toBe(1);
  });

  test("field accuracy scores extraction field by field", () => {
    expect(fieldAccuracy(STRUCTURED_CASES)).toBeLessThan(1);
    expect(fieldAccuracy([{ id: "a", expected: { x: 1, y: "z" }, actual: { x: 1, y: "z" } }])).toBe(
      1,
    );
    expect(fieldAccuracy([{ id: "a", expected: { x: 1 }, actual: { x: 2 } }])).toBe(0);
  });

  test("open-ended rate detects a category outside the allowed set", () => {
    expect(openEndedRate(CLASSIFICATION_CASES)).toBe(0.5);
  });

  test("accuracy and empty-input behaviour", () => {
    expect(accuracy([{ expected: "a", actual: "a" }])).toBe(1);
    expect(accuracy([])).toBe(0);
    expect(fieldAccuracy([])).toBe(0);
    expect(hallucinationRate([])).toBe(0);
  });

  test("distribution reports count, extremes, mean and p95", () => {
    const stats = distribution([10, 20, 30, 40]);
    expect(stats.count).toBe(4);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(40);
    expect(stats.mean).toBe(25);
    expect(stats.p95).toBe(40);
    expect(distribution([])).toEqual({ count: 0, min: 0, max: 0, mean: 0, p95: 0 });
  });

  test("ECE and temperature fitting are wired to the shared implementation", () => {
    const honest = [
      { confidence: 0.9, correct: true },
      { confidence: 0.1, correct: false },
    ];
    expect(ece(honest)).toBeLessThan(ece(honest.map((s) => ({ ...s, confidence: 0.99 }))));
    expect(temperatureFor(honest)).toBeGreaterThan(0);
    expect(temperatureFor([])).toBeNull();
  });
});

describe("fallback correctness", () => {
  test("the built-in scenarios all resolve as expected", () => {
    const report = evaluate({
      textCases: TEXT_CASES,
      structuredCases: STRUCTURED_CASES,
      classificationCases: CLASSIFICATION_CASES,
      latenciesMs: [120, 340, 90],
      memorySamplesMb: [512, 900],
      fallbackScenarios: DEFAULT_FALLBACK_SCENARIOS,
      observations: [],
      questionType: "triage",
      webgpuAvailable: true,
    });
    expect(report.fallbackFailures).toEqual([]);
    expect(report.fallbackCorrect).toBe(true);
  });

  test("a scenario that would leak financial data to a provider is reported as a failure", () => {
    const report = evaluate({
      textCases: [],
      structuredCases: [],
      classificationCases: [],
      latenciesMs: [],
      memorySamplesMb: [],
      fallbackScenarios: [
        {
          id: "leak",
          dataClasses: ["FINANCIAL"],
          mode: "hybrid",
          priority: ["provider", "local", "disabled"],
          available: { webgpu: false, local: true, provider: true },
          expected: "provider",
        },
      ],
      observations: [],
      questionType: "triage",
      webgpuAvailable: false,
    });
    expect(report.fallbackCorrect).toBe(false);
    expect(report.fallbackFailures).toEqual(["leak"]);
  });
});

describe("decision calibration gate", () => {
  test("blocks auto-advance without enough labeled data", () => {
    const verdict = evaluateCalibrationGate("triage", observations(20, 10));
    expect(verdict.allowedToAutoAdvance).toBe(false);
    const samples = verdict.checks.find((check) => check.id === "labeled-samples");
    expect(samples?.passed).toBe(false);
    expect(samples?.detail).toContain(String(MIN_LABELED_SAMPLES));
  });

  test("blocks auto-advance before a week of observations", () => {
    const verdict = evaluateCalibrationGate("triage", observations(400, 2));
    const window = verdict.checks.find((check) => check.id === "observation-window");
    expect(window?.passed).toBe(false);
    expect(window?.detail).toContain(String(MIN_OBSERVATION_DAYS));
  });

  test("blocks auto-advance when confidence does not separate outcomes", () => {
    const flat: Observation[] = Array.from({ length: 300 }, (_, index) => ({
      confidence: 0.5,
      correct: index % 2 === 0,
      observedAt: new Date(Date.UTC(2026, 0, 1) + index * 3_600_000),
    }));
    const verdict = evaluateCalibrationGate("dunning", flat);
    expect(verdict.allowedToAutoAdvance).toBe(false);
    expect(confidenceMargin(flat)).toBeLessThan(MIN_CONFIDENCE_MARGIN);
  });

  test("passes with enough data, a long enough window and separating confidence", () => {
    const verdict = evaluateCalibrationGate("triage", observations(400, 14));
    expect(verdict.temperature).not.toBeNull();
    expect(verdict.allowedToAutoAdvance).toBe(true);
  });

  test("requires both correct and incorrect outcomes", () => {
    const allCorrect: Observation[] = Array.from({ length: 300 }, (_, index) => ({
      confidence: 0.9,
      correct: true,
      observedAt: new Date(Date.UTC(2026, 0, 1) + index * 3_600_000),
    }));
    const verdict = evaluateCalibrationGate("triage", allCorrect);
    expect(verdict.checks.find((check) => check.id === "both-outcomes-present")?.passed).toBe(
      false,
    );
    expect(verdict.allowedToAutoAdvance).toBe(false);
  });

  test("the evaluation window is measured in days", () => {
    const window = observations(3, 7);
    expect(evaluationWindow(window)).toBeCloseTo(7, 3);
    expect(evaluationWindow([])).toBe(0);
  });

  test("a temperature below 1 sharpens and above 1 cools", () => {
    expect(applyTemperature(0.9, 2)).toBeLessThan(0.9);
    expect(applyTemperature(0.9, 0.5)).toBeGreaterThan(0.9);
    expect(applyTemperature(0.1, 0.5)).toBeLessThan(0.1);
    expect(applyTemperature(1, 1)).toBeLessThan(1);
  });
});

describe("report rendering", () => {
  const report = evaluate({
    textCases: TEXT_CASES,
    structuredCases: STRUCTURED_CASES,
    classificationCases: CLASSIFICATION_CASES,
    latenciesMs: [100, 200, 300],
    memorySamplesMb: [400, 800],
    fallbackScenarios: DEFAULT_FALLBACK_SCENARIOS,
    observations: observations(400, 14),
    questionType: "triage",
    webgpuAvailable: true,
  });

  test("json output is stable and diffable", () => {
    const first = toJson(report, OPTIONS);
    const second = toJson(report, OPTIONS);
    expect(first).toBe(second);
    const parsed = JSON.parse(first) as Record<string, unknown>;
    expect(Object.keys(parsed)[0]).toBe("generatedAt");
    expect(parsed["fallbackCorrect"]).toBe(true);
    expect(parsed["webgpuAvailable"]).toBe(true);
    expect(first.endsWith("\n")).toBe(true);
  });

  test("text output covers every dimension and the gate", () => {
    const text = toText(report, OPTIONS);
    for (const needle of [
      "es-CO quality",
      "en quality",
      "extraction",
      "classification",
      "hallucination rate",
      "latency ms",
      "memory MB",
      "webgpu available",
      "fallback correct",
      "ECE",
      "calibration gate",
    ]) {
      expect(text).toContain(needle);
    }
    expect(text).not.toContain("\u001b[");
  });
});
