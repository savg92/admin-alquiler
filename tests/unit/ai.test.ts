import { describe, expect, test } from "bun:test";
import {
  allowedRuntimes,
  applyDecisionThreshold,
  calibrateConfidence,
  defaultPriority,
  expectedCalibrationError,
  fitTemperature,
  minimizeFields,
  privacyLevelFor,
  redactPersonal,
  resolveRuntime,
} from "@admin-alquiler/ai";

describe("privacy policy engine", () => {
  test("financial, legal and personal stay local", () => {
    expect(privacyLevelFor(["FINANCIAL"])).toBe("local-only");
    expect(privacyLevelFor(["LEGAL"])).toBe("local-only");
    expect(privacyLevelFor(["PERSONAL"])).toBe("local-only");
    expect(privacyLevelFor(["INTERNAL"])).toBe("local-preferred");
    expect(privacyLevelFor(["PUBLIC"])).toBe("provider-allowed");
  });

  test("local-only never resolves to a provider runtime", () => {
    expect(allowedRuntimes("local-only", true)).toEqual(["local", "webgpu"]);
    expect(allowedRuntimes("provider-allowed", false)).toEqual(["local", "webgpu"]);
    expect(allowedRuntimes("provider-allowed", true)).toContain("provider");
  });

  test("redaction masks emails and Colombian phones", () => {
    const { redacted, redactions } = redactPersonal(
      "Contactar a ana@ejemplo.co o al 300 123 4567 por la cuota.",
    );
    expect(redactions).toBe(2);
    expect(redacted).toContain("[email]");
    expect(redacted).toContain("[teléfono]");
    expect(redacted).not.toContain("ana@ejemplo.co");
  });

  test("minimization keeps only allowed fields", () => {
    expect(minimizeFields({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });
});

describe("execution modes and fallback", () => {
  test("hybrid walks priority until an available runtime", () => {
    expect(
      resolveRuntime("hybrid", defaultPriority(), { webgpu: false, local: true, provider: true }),
    ).toBe("local");
    expect(
      resolveRuntime("hybrid", defaultPriority(), { webgpu: false, local: false, provider: false }),
    ).toBe("disabled");
    expect(
      resolveRuntime("hybrid", ["provider", "disabled"], {
        webgpu: true,
        local: true,
        provider: false,
      }),
    ).toBe("disabled");
  });

  test("single modes degrade to disabled when unavailable", () => {
    expect(
      resolveRuntime("webgpu", defaultPriority(), { webgpu: false, local: true, provider: true }),
    ).toBe("disabled");
    expect(
      resolveRuntime("disabled", defaultPriority(), { webgpu: true, local: true, provider: true }),
    ).toBe("disabled");
  });
});

describe("decide thresholds and calibration", () => {
  test("low confidence escalates instead of auto-advancing", () => {
    const low = applyDecisionThreshold(
      { kind: "choice", choice: "urgent", confidence: 0.5 },
      "triage",
    );
    expect(low.escalated).toBe(true);
    const high = applyDecisionThreshold(
      { kind: "choice", choice: "urgent", confidence: 0.95 },
      "triage",
    );
    expect(high.escalated).toBe(false);
    const dunning = applyDecisionThreshold(
      { kind: "score", score: 0.85, confidence: 0.85 },
      "dunning",
    );
    expect(dunning.escalated).toBe(true);
  });

  test("temperature scaling cools overconfidence", () => {
    expect(calibrateConfidence(0.9, 1)).toBeCloseTo(0.9, 3);
    expect(calibrateConfidence(0.9, 2)).toBeLessThan(0.9);
    expect(() => calibrateConfidence(0.5, 0)).toThrow(/positive/);
  });

  test("ECE rewards honest confidence and fitting finds it", () => {
    const honest = [
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.1, correct: false },
      { confidence: 0.1, correct: false },
    ];
    const cocky = honest.map((sample) => ({ ...sample, confidence: 0.99 }));
    expect(expectedCalibrationError(honest, 5)).toBeLessThan(expectedCalibrationError(cocky, 5));
    const fitted = fitTemperature(cocky);
    expect(fitted).toBeGreaterThan(1);
    expect(() => fitTemperature([])).toThrow(/without samples/);
  });
});
