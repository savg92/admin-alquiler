import { fitTemperature, type CalibrationSample, type QuestionType } from "@admin-alquiler/ai";
import { ece } from "./metrics";

/** Below this, a fitted temperature is noise and auto-advance must stay off. */
export const MIN_LABELED_SAMPLES = 200;

/** §11 requires a week of logged confidence-versus-outcome before raising thresholds. */
export const MIN_OBSERVATION_DAYS = 7;

/** Mean confidence of correct answers must exceed that of incorrect answers by this much. */
export const MIN_CONFIDENCE_MARGIN = 0.1;

/** After calibration, expected calibration error must be at or below this. */
export const MAX_CALIBRATED_ECE = 0.1;

export interface Observation {
  confidence: number;
  correct: boolean;
  observedAt: Date;
}

export interface GateCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface GateVerdict {
  questionType: QuestionType;
  allowedToAutoAdvance: boolean;
  temperature: number | null;
  checks: GateCheck[];
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function evaluationWindow(observations: Observation[]): number {
  if (observations.length === 0) {
    return 0;
  }
  const times = observations.map((entry) => entry.observedAt.getTime());
  return (Math.max(...times) - Math.min(...times)) / 86_400_000;
}

export function confidenceMargin(samples: CalibrationSample[]): number {
  const correct = samples.filter((sample) => sample.correct).map((sample) => sample.confidence);
  const wrong = samples.filter((sample) => !sample.correct).map((sample) => sample.confidence);
  if (correct.length === 0 || wrong.length === 0) {
    return 0;
  }
  return mean(correct) - mean(wrong);
}

export function evaluateCalibrationGate(
  questionType: QuestionType,
  observations: Observation[],
): GateVerdict {
  const samples: CalibrationSample[] = observations.map((entry) => ({
    confidence: entry.confidence,
    correct: entry.correct,
  }));
  const checks: GateCheck[] = [
    {
      id: "labeled-samples",
      passed: samples.length >= MIN_LABELED_SAMPLES,
      detail: `${samples.length} labeled samples (need ${MIN_LABELED_SAMPLES}).`,
    },
    {
      id: "observation-window",
      passed: evaluationWindow(observations) >= MIN_OBSERVATION_DAYS,
      detail: `${evaluationWindow(observations).toFixed(2)} days observed (need ${MIN_OBSERVATION_DAYS}).`,
    },
    {
      id: "both-outcomes-present",
      passed: samples.some((sample) => sample.correct) && samples.some((sample) => !sample.correct),
      detail: "Calibration needs both correct and incorrect labeled outcomes.",
    },
  ];

  const margin = confidenceMargin(samples);
  checks.push({
    id: "confidence-margin",
    passed: margin >= MIN_CONFIDENCE_MARGIN,
    detail: `correct/incorrect confidence margin ${margin.toFixed(4)} (need ${MIN_CONFIDENCE_MARGIN}).`,
  });

  const temperature = samples.length === 0 ? null : fitTemperature(samples);
  const calibrated =
    temperature === null
      ? []
      : samples.map((sample) => ({
          confidence: applyTemperature(sample.confidence, temperature),
          correct: sample.correct,
        }));
  const calibratedError = ece(calibrated);
  checks.push({
    id: "calibrated-ece",
    passed: calibrated.length > 0 && calibratedError <= MAX_CALIBRATED_ECE,
    detail: `calibrated ECE ${calibratedError} (need <= ${MAX_CALIBRATED_ECE}).`,
  });

  return {
    questionType,
    allowedToAutoAdvance: checks.every((check) => check.passed),
    temperature,
    checks,
  };
}

export function applyTemperature(confidence: number, temperature: number): number {
  const clamped = Math.min(0.999, Math.max(0.001, confidence));
  const logit = Math.log(clamped / (1 - clamped));
  const scaled = 1 / (1 + Math.exp(-logit / temperature));
  return Math.round(scaled * 10000) / 10000;
}
