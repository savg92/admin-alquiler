import { describe, expect, test } from "bun:test";
import {
  agingReport,
  applyIndexIncrease,
  buildRentSchedule,
  computeQuorum,
  consumptionBetween,
  depositRemaining,
  detectReadingAnomaly,
  dunningStageFor,
  dunningTemplateKey,
  evaluateApprovalRule,
  evaluateDecision,
  evaluateLateFee,
  expiringPolicies,
  maintenanceSla,
  quoteIndemnity,
  renewalStage,
  validateCodeudorTerms,
  validateDepositMovement,
  validateLateFeeRule,
  validateMeterReading,
  validateRenewalTerms,
  validateTermination,
  COLOMBIA_DEFAULT_LATE_FEE,
} from "@admin-alquiler/domain";

describe("codeudores and renewals", () => {
  test("codeudor dates validate and policies surface expiries", () => {
    expect(() =>
      validateCodeudorTerms({ name: "Fiador", validFrom: "2026-01-01", validUntil: "2025-01-01" }),
    ).toThrow(/on or after/);
    const now = Date.parse("2026-06-01");
    const expiring = expiringPolicies(
      [
        { id: "a", validUntil: "2026-06-20" },
        { id: "b", validUntil: "2027-01-01" },
        { id: "c", validUntil: null },
      ],
      now,
      30,
    );
    expect(expiring.map((row) => row.id)).toEqual(["a"]);
  });

  test("renewal stages and terms", () => {
    expect(renewalStage(95)).toBe(0);
    expect(renewalStage(90)).toBe(90);
    expect(renewalStage(45)).toBe(60);
    expect(renewalStage(10)).toBe(30);
    expect(() =>
      validateRenewalTerms({ currentEndDate: "2027-01-31", newEndDate: "2026-01-31" }),
    ).toThrow(/after the current/);
  });
});

describe("termination indemnity", () => {
  test("Colombia default caps at three rents, generic waives", () => {
    expect(quoteIndemnity("CO_EARLY_TERMINATION_DEFAULT", 100, 6).amountMinor).toBe(300);
    expect(quoteIndemnity("GENERIC_NO_INDEMNITY", 100, 6).amountMinor).toBe(0);
    expect(() =>
      validateTermination({
        noticeDate: "2026-06-10",
        effectiveDate: "2026-06-01",
        cause: "Mutuo acuerdo",
      }),
    ).toThrow(/on or after/);
  });
});

describe("meters, deposits and collections", () => {
  test("readings flag rollbacks and spikes; consumption must be positive", () => {
    expect(
      validateMeterReading({ utility: "WATER", value: 5, readingDate: "2026-01-01" }),
    ).toBeUndefined();
    expect(detectReadingAnomaly(100, 50).anomaly).toBe(true);
    expect(detectReadingAnomaly(100, 400).anomaly).toBe(true);
    expect(detectReadingAnomaly(100, 150).anomaly).toBe(false);
    expect(consumptionBetween(100, 150)).toBe(50);
    expect(() => consumptionBetween(150, 100)).toThrow(/positive/);
  });

  test("deposit ledger reconciles and guards overdrafts", () => {
    const ledger = { heldMinor: 100, deductedMinor: 20, returnedMinor: 30 };
    expect(depositRemaining(ledger)).toBe(50);
    expect(() => validateDepositMovement(ledger, 51)).toThrow(/exceeds/);
  });

  test("aging buckets and late fees", () => {
    const now = Date.parse("2026-03-10");
    const buckets = agingReport(
      [
        { id: "a", balanceMinor: 10, dueDate: "2026-03-10" },
        { id: "b", balanceMinor: 20, dueDate: "2026-02-05" },
        { id: "c", balanceMinor: 30, dueDate: "2025-11-01" },
      ],
      now,
    );
    expect(buckets.currentMinor).toBe(10);
    expect(buckets.d31_60Minor).toBe(20);
    expect(buckets.d90PlusMinor).toBe(30);
    expect(evaluateLateFee(10000, 33, COLOMBIA_DEFAULT_LATE_FEE).feeMinor).toBe(150);
    expect(evaluateLateFee(10000, 0, COLOMBIA_DEFAULT_LATE_FEE).applied).toBe(false);
    expect(() =>
      validateLateFeeRule({ rateType: "PERCENTAGE", rate: 101, graceDays: 0, base: "TOTAL_DUE" }),
    ).toThrow(/exceed 100/);
  });

  test("dunning stages and template keys", () => {
    expect(dunningStageFor(2)).toBeNull();
    expect(dunningStageFor(3)).toBe(3);
    expect(dunningStageFor(10)).toBe(7);
    expect(dunningStageFor(40)).toBe(30);
    expect(dunningTemplateKey(7)).toBe("dunning.day_7");
  });

  test("index increases respect caps and schedules build", () => {
    expect(applyIndexIncrease(10000, 5.2, 3)).toBe(10300);
    expect(buildRentSchedule("2026-02", 2, 500).map((entry) => entry.period)).toEqual([
      "2026-02",
      "2026-03",
    ]);
  });
});

describe("governance math", () => {
  test("quorum counts proxies once and needs half plus one", () => {
    const full = computeQuorum([
      { ownerId: "a", sharePct: 70 },
      { ownerId: "b", sharePct: 30, proxyTo: "a" },
    ]);
    expect(full).toEqual({ presentPct: 100, quorumMet: true });
    const short = computeQuorum([{ ownerId: "b", sharePct: 30 }]);
    expect(short.quorumMet).toBe(false);
  });

  test("ordinary needs half-plus-one present, qualified needs seventy total", () => {
    const ordinary = evaluateDecision(
      [
        { choice: "APPROVE", weight: 40 },
        { choice: "REJECT", weight: 30 },
      ],
      "ORDINARY",
      100,
      70,
    );
    expect(ordinary.approved).toBe(true);
    const qualified = evaluateDecision([{ choice: "APPROVE", weight: 60 }], "QUALIFIED", 100, 60);
    expect(qualified.approved).toBe(false);
  });

  test("owner authorization modes", () => {
    expect(evaluateApprovalRule("one", 10, 100)).toBe(true);
    expect(evaluateApprovalRule("quorum", 40, 100)).toBe(false);
    expect(evaluateApprovalRule("quorum", 60, 100)).toBe(true);
    expect(evaluateApprovalRule("percentage", 30, 100, 30)).toBe(true);
    expect(evaluateApprovalRule("all", 100, 100)).toBe(true);
    expect(evaluateApprovalRule("all", 90, 100)).toBe(false);
  });

  test("maintenance SLA counts on-time resolutions", () => {
    const sla = maintenanceSla(
      [
        { status: "RESOLVED", createdAt: "2026-01-01", updatedAt: "2026-01-03" },
        { status: "RESOLVED", createdAt: "2026-01-01", updatedAt: "2026-02-01" },
        { status: "OPEN", createdAt: "2026-02-01", updatedAt: "2026-02-01" },
      ],
      7,
    );
    expect(sla).toEqual({ resolved: 2, withinTarget: 1, rate: 0.5, openCases: 1 });
  });
});
