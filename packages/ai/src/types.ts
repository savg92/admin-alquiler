export type ExecutionMode = "disabled" | "webgpu" | "local" | "hybrid" | "provider";

export type RuntimeKind = "disabled" | "webgpu" | "local" | "provider";

export type DataClass =
  "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SENSITIVE" | "FINANCIAL" | "LEGAL" | "PERSONAL";

export type ModelLifecycle =
  "candidate" | "installed" | "evaluated" | "approved" | "active" | "deprecated";

export type DecideOutput =
  | { kind: "choice"; choice: string; confidence: number }
  | { kind: "score"; score: number; confidence: number }
  | { kind: "none"; confidence: number };

export interface DecideResult {
  kind: "choice" | "score" | "none";
  choice?: string;
  score?: number;
  confidence: number;
  escalated: boolean;
  threshold: number;
}

export type QuestionType = "triage" | "proof-match" | "dunning" | "generic";

export const DECIDE_THRESHOLDS: Record<QuestionType, number> = {
  triage: 0.8,
  "proof-match": 0.85,
  dunning: 0.9,
  generic: 0.8,
};
