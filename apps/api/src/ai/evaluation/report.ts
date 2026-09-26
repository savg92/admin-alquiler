import type { EvaluationReport } from "./suites";

export interface ReportOptions {
  model: string;
  provider: string;
  runtime: string;
  generatedAt: string;
}

function ordered(report: EvaluationReport, options: ReportOptions): Record<string, unknown> {
  return {
    generatedAt: options.generatedAt,
    model: options.model,
    provider: options.provider,
    runtime: options.runtime,
    spanishQuality: report.spanishQuality,
    englishQuality: report.englishQuality,
    structuredExtraction: report.structuredExtraction,
    classification: report.classification,
    classificationOutsideAllowedSet: report.classificationOutsideAllowedSet,
    summarization: report.summarization,
    hallucinationRate: report.hallucinationRate,
    forbiddenContentRate: report.forbiddenContentRate,
    latencyMs: report.latencyMs,
    memoryMb: report.memoryMb,
    webgpuAvailable: report.webgpuAvailable,
    fallbackCorrect: report.fallbackCorrect,
    fallbackFailures: report.fallbackFailures,
    ece: report.ece,
    temperature: report.temperature,
    calibration: {
      questionType: report.calibration.questionType,
      allowedToAutoAdvance: report.calibration.allowedToAutoAdvance,
      checks: report.calibration.checks.map((check) => ({
        id: check.id,
        passed: check.passed,
        detail: check.detail,
      })),
    },
  };
}

export function toJson(report: EvaluationReport, options: ReportOptions): string {
  return `${JSON.stringify(ordered(report, options), null, 2)}\n`;
}

export function toText(report: EvaluationReport, options: ReportOptions): string {
  const lines = [
    `AI evaluation — ${options.model} via ${options.provider} (${options.runtime})`,
    `generated: ${options.generatedAt}`,
    `es-CO quality:      ${report.spanishQuality}`,
    `en quality:        ${report.englishQuality}`,
    `extraction:        ${report.structuredExtraction}`,
    `classification:    ${report.classification} (outside allowed set: ${report.classificationOutsideAllowedSet})`,
    `summarization:     ${report.summarization}`,
    `hallucination rate:${report.hallucinationRate}`,
    `forbidden content: ${report.forbiddenContentRate}`,
    `latency ms:        count=${report.latencyMs.count} mean=${report.latencyMs.mean} p95=${report.latencyMs.p95} max=${report.latencyMs.max}`,
    `memory MB:         count=${report.memoryMb.count} mean=${report.memoryMb.mean} p95=${report.memoryMb.p95} max=${report.memoryMb.max}`,
    `webgpu available:  ${report.webgpuAvailable}`,
    `fallback correct:  ${report.fallbackCorrect}${report.fallbackFailures.length === 0 ? "" : ` (failed: ${report.fallbackFailures.join(", ")})`}`,
    `ECE:               ${report.ece} (temperature ${report.temperature ?? "n/a"})`,
    `calibration gate:  ${report.calibration.allowedToAutoAdvance ? "PASS" : "BLOCKED"} for ${report.calibration.questionType}`,
  ];
  for (const check of report.calibration.checks) {
    lines.push(`  - [${check.passed ? "x" : " "}] ${check.id}: ${check.detail}`);
  }
  return `${lines.join("\n")}\n`;
}
