import type { DataClass } from "./types";

/**
 * PHASE-2 §9. Every gateway call walks these stages in order. The order is part
 * of the contract: a stage may only run once the previous one has passed.
 */
export type SafetyStage =
  "classify" | "minimize" | "select" | "infer" | "validate" | "authorize" | "confirm";

export const SAFETY_STAGES: readonly SafetyStage[] = [
  "classify",
  "minimize",
  "select",
  "infer",
  "validate",
  "authorize",
  "confirm",
];

/**
 * Actions AI may never perform by itself. A suggestion about one of these is
 * fine; writing one is not. Mirrors docs/security/ai-security.md.
 */
export const AI_FORBIDDEN_ACTIONS: readonly string[] = [
  "payment.record",
  "payment.post",
  "payment.refund",
  "charge.post",
  "charge.write",
  "receipt.issue",
  "settlement.payout",
  "contract.sign",
  "contract.terminate",
  "document.approve",
  "signature.capture",
  "permission.grant",
  "membership.invite",
  "owner.approval.resolve",
  "assembly.vote.cast",
];

const SENSITIVE: readonly DataClass[] = [
  "FINANCIAL",
  "LEGAL",
  "PERSONAL",
  "SENSITIVE",
  "CONFIDENTIAL",
];

export function isForbiddenAiAction(action: string): boolean {
  return AI_FORBIDDEN_ACTIONS.includes(action);
}

/** Where a call stopped: the last stage it passed, or `use` once it may be applied. */
export type PipelineOutcome = SafetyStage | "use";

export interface ConfirmationInput {
  feature: string;
  dataClasses: readonly DataClass[];
  /** `decide` reported low confidence and routed to a human. */
  escalated?: boolean;
  /** The action the suggestion would eventually drive, if any. */
  action?: string;
  /** Consequential actions always need a human regardless of confidence. */
  destructive?: boolean;
}

export interface ConfirmationDecision {
  requiresConfirmation: boolean;
  stage: PipelineOutcome;
  reason: string;
}

/**
 * Decides whether an AI result may be used on its own or must stop at the
 * `confirm` stage for a human. Escalated decisions and anything touching
 * sensitive data or a business record always stop.
 */
export function requiresHumanConfirmation(input: ConfirmationInput): ConfirmationDecision {
  if (input.escalated === true) {
    return {
      requiresConfirmation: true,
      stage: "confirm",
      reason: "Model confidence was below threshold; a human takes over.",
    };
  }
  if (input.action !== undefined && isForbiddenAiAction(input.action)) {
    return {
      requiresConfirmation: true,
      stage: "confirm",
      reason: `AI may suggest but never perform "${input.action}"; a human must confirm.`,
    };
  }
  if (input.destructive === true) {
    return {
      requiresConfirmation: true,
      stage: "confirm",
      reason: "Destructive actions always require human confirmation.",
    };
  }
  if (input.dataClasses.some((entry) => SENSITIVE.includes(entry))) {
    return {
      requiresConfirmation: true,
      stage: "confirm",
      reason: "Result derives from sensitive data and must be confirmed before use.",
    };
  }
  return {
    requiresConfirmation: false,
    stage: "use",
    reason: "Advisory result with no sensitive data and no business-record effect.",
  };
}

export class UnconfirmedAiResultError extends Error {
  readonly stage: PipelineOutcome;

  constructor(decision: ConfirmationDecision) {
    super(`AI result requires human confirmation: ${decision.reason}`);
    this.name = "UnconfirmedAiResultError";
    this.stage = decision.stage;
  }
}

/**
 * Guard for the `use result` step: throws unless the confirmation decision
 * allows the result through, so an unconfirmed suggestion cannot be applied.
 */
export function assertResultUsable(decision: ConfirmationDecision, confirmed: boolean): void {
  if (decision.requiresConfirmation && !confirmed) {
    throw new UnconfirmedAiResultError(decision);
  }
}
