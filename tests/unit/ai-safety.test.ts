import { describe, expect, test } from "bun:test";
import {
  AI_FORBIDDEN_ACTIONS,
  assertResultUsable,
  isForbiddenAiAction,
  requiresHumanConfirmation,
  SAFETY_STAGES,
  UnconfirmedAiResultError,
} from "@admin-alquiler/ai";

describe("§9 safety pipeline stages", () => {
  test("the pipeline runs classify before infer and confirm last", () => {
    expect(SAFETY_STAGES).toEqual([
      "classify",
      "minimize",
      "select",
      "infer",
      "validate",
      "authorize",
      "confirm",
    ]);
  });
});

describe("AI never writes business records directly", () => {
  test("payments, postings, signatures and permissions are forbidden actions", () => {
    for (const action of [
      "payment.record",
      "payment.post",
      "charge.post",
      "receipt.issue",
      "contract.sign",
      "document.approve",
      "signature.capture",
      "permission.grant",
      "owner.approval.resolve",
    ]) {
      expect(isForbiddenAiAction(action)).toBe(true);
      expect(AI_FORBIDDEN_ACTIONS).toContain(action);
    }
  });

  test("reading and suggesting are not forbidden", () => {
    expect(isForbiddenAiAction("document.read")).toBe(false);
    expect(isForbiddenAiAction("suggestion.create")).toBe(false);
  });

  test("a suggestion about a forbidden action still requires confirmation", () => {
    const decision = requiresHumanConfirmation({
      feature: "proof-match",
      dataClasses: ["PUBLIC"],
      action: "payment.post",
    });
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.stage).toBe("confirm");
    expect(decision.reason).toContain("payment.post");
  });
});

describe("human confirmation gate", () => {
  test("an escalated decision stops at confirm", () => {
    const decision = requiresHumanConfirmation({
      feature: "maintenance-triage",
      dataClasses: ["PUBLIC"],
      escalated: true,
    });
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.reason).toMatch(/confidence/i);
  });

  test("sensitive data always stops at confirm", () => {
    for (const dataClass of [
      "FINANCIAL",
      "LEGAL",
      "PERSONAL",
      "SENSITIVE",
      "CONFIDENTIAL",
    ] as const) {
      const decision = requiresHumanConfirmation({
        feature: "summarization",
        dataClasses: [dataClass],
      });
      expect(decision.requiresConfirmation).toBe(true);
    }
  });

  test("destructive actions always stop even with confident output", () => {
    const decision = requiresHumanConfirmation({
      feature: "contract-renewal",
      dataClasses: ["PUBLIC"],
      destructive: true,
    });
    expect(decision.requiresConfirmation).toBe(true);
  });

  test("an advisory public draft is usable without confirmation", () => {
    const decision = requiresHumanConfirmation({
      feature: "communication-assist",
      dataClasses: ["PUBLIC"],
    });
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.stage).toBe("use");
  });

  test("an unconfirmed result cannot be used", () => {
    const decision = requiresHumanConfirmation({
      feature: "ledger-summary",
      dataClasses: ["FINANCIAL"],
    });
    expect(() => assertResultUsable(decision, false)).toThrow(UnconfirmedAiResultError);
    expect(() => assertResultUsable(decision, true)).not.toThrow();
  });

  test("a usable result passes the guard either way", () => {
    const decision = requiresHumanConfirmation({
      feature: "communication-assist",
      dataClasses: ["INTERNAL"],
    });
    expect(() => assertResultUsable(decision, false)).not.toThrow();
    expect(() => assertResultUsable(decision, true)).not.toThrow();
  });
});
