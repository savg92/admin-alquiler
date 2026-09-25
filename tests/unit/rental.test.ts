import { describe, expect, test } from "bun:test";
import {
  allocatePayment,
  chargePaymentStatus,
  periodDueDate,
  periodKey,
  validateContractTerms,
} from "@admin-alquiler/domain";

describe("rental money logic", () => {
  test("contract terms require valid dates and positive rent", () => {
    expect(() =>
      validateContractTerms({
        startDate: "2026-02-01",
        endDate: "2027-01-31",
        rentAmountMinor: 180000000,
      }),
    ).not.toThrow();
    expect(() =>
      validateContractTerms({
        startDate: "2027-01-31",
        endDate: "2026-02-01",
        rentAmountMinor: 100,
      }),
    ).toThrow(/after startDate/);
    expect(() =>
      validateContractTerms({ startDate: "2026-02-01", endDate: "2027-01-31", rentAmountMinor: 0 }),
    ).toThrow(/positive integer/);
    expect(() =>
      validateContractTerms({
        startDate: "2026-02-01",
        endDate: "2027-01-31",
        rentAmountMinor: 10.5,
      }),
    ).toThrow(/positive integer/);
  });

  test("period keys and due dates", () => {
    expect(periodKey(new Date(Date.UTC(2026, 1, 15)))).toBe("2026-02");
    expect(periodDueDate("2026-02").toISOString()).toBe("2026-02-05T00:00:00.000Z");
    expect(() => periodDueDate("2026-13")).toThrow(/Invalid period/);
    expect(() => periodDueDate("febrero")).toThrow(/Invalid period/);
  });

  test("payments allocate oldest-first with exact integer math", () => {
    const charges = [
      { id: "mar", balanceMinor: 180000000, dueDate: "2026-03-05" },
      { id: "feb", balanceMinor: 180000000, dueDate: "2026-02-05" },
    ];
    const result = allocatePayment(charges, 200000000);
    expect(result).toEqual({
      allocations: [
        { chargeId: "feb", amountMinor: 180000000 },
        { chargeId: "mar", amountMinor: 20000000 },
      ],
      remainderMinor: 0,
    });
  });

  test("overpayment leaves a remainder and zero balances are skipped", () => {
    const result = allocatePayment(
      [
        { id: "a", balanceMinor: 0, dueDate: "2026-01-05" },
        { id: "b", balanceMinor: 50000, dueDate: "2026-02-05" },
      ],
      80000,
    );
    expect(result).toEqual({
      allocations: [{ chargeId: "b", amountMinor: 50000 }],
      remainderMinor: 30000,
    });
  });

  test("charge payment status", () => {
    expect(chargePaymentStatus(100, 0)).toBe("PENDING");
    expect(chargePaymentStatus(100, 40)).toBe("PARTIAL");
    expect(chargePaymentStatus(100, 100)).toBe("PAID");
  });
});
