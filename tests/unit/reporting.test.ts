import { describe, expect, test } from "bun:test";
import {
  delinquencyRate,
  occupancyRate,
  statementTotals,
  upcomingExpirations,
  validateCurrencyCode,
  validateTransferRef,
} from "@admin-alquiler/domain";

describe("reporting", () => {
  test("occupancy and delinquency rates clamp to 0-1", () => {
    expect(occupancyRate({ totalUnits: 4, occupiedUnits: 3 })).toBe(0.75);
    expect(occupancyRate({ totalUnits: 0, occupiedUnits: 0 })).toBe(0);
    expect(delinquencyRate({ overdueMinor: 50000, totalBilledMinor: 200000 })).toBe(0.25);
    expect(delinquencyRate({ overdueMinor: 0, totalBilledMinor: 0 })).toBe(0);
  });

  test("upcoming expirations filter and sort within the window", () => {
    const now = Date.parse("2026-01-01");
    const result = upcomingExpirations(
      [
        { id: "far", endDate: "2027-06-01" },
        { id: "past", endDate: "2025-12-01" },
        { id: "soon-b", endDate: "2026-03-01" },
        { id: "soon-a", endDate: "2026-02-01" },
      ],
      now,
    );
    expect(result.map((contract) => contract.id)).toEqual(["soon-a", "soon-b"]);
  });

  test("statement totals never go negative", () => {
    expect(statementTotals(200000, 180000)).toEqual({
      billedMinor: 200000,
      collectedMinor: 180000,
      outstandingMinor: 20000,
    });
    expect(statementTotals(100000, 150000).outstandingMinor).toBe(0);
  });

  test("payout refs and currency codes validate", () => {
    expect(validateTransferRef("TX-123")).toBe("TX-123");
    expect(() => validateTransferRef("  ")).toThrow(/required/);
    expect(validateCurrencyCode("cop")).toBe("COP");
    expect(() => validateCurrencyCode("XXX")).toThrow(/Unsupported currency/);
  });
});
