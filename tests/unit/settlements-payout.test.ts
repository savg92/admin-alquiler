import { describe, expect, test } from "bun:test";
import { SettlementsService } from "../../apps/api/src/settlements/settlements.service";
import type { SettlementDetail, SettlementsStore } from "../../apps/api/src/settlements/store";

function baseSettlement(overrides: Partial<SettlementDetail> = {}): SettlementDetail {
  return {
    id: "settlement-1",
    propertyId: "prop-1",
    period: "2026-01",
    collectedMinor: 180000000,
    commissionMinor: 0,
    deductionsMinor: 0,
    netMinor: 180000000,
    currency: "COP",
    payoutRef: null,
    payoutAt: null,
    lines: [],
    ...overrides,
  };
}

function fakeStore(current: SettlementDetail | null): SettlementsStore & {
  audits: string[];
  updated: SettlementDetail | null;
} {
  const state = { audits: [] as string[], updated: null as SettlementDetail | null };
  const store: SettlementsStore & typeof state = {
    ...state,
    findProperty: async () => ({ id: "prop-1" }),
    findOrgCurrency: async () => "COP",
    paymentsTotalMinor: async () => 0,
    activeOwnershipShares: async () => [],
    findCommissionPct: async () => 0,
    findSettlement: async () => null,
    findSettlementById: async () => current,
    createSettlement: async () => baseSettlement(),
    recordPayout: async (id, transferRef, paidAt) => {
      const updated = baseSettlement({
        ...current,
        id,
        payoutRef: transferRef,
        payoutAt: paidAt.toISOString(),
      });
      state.updated = updated;
      return updated;
    },
    writeAuditEvent: async (event) => {
      state.audits.push(event.action);
    },
  };
  return store;
}

describe("settlements recordPayout", () => {
  test("records payout with trimmed ref and audit", async () => {
    const store = fakeStore(baseSettlement());
    const service = new SettlementsService(store);
    const result = await service.recordPayout("settlement-1", "org-1", "actor-1", "  TX-123  ");
    expect(result.payoutRef).toBe("TX-123");
    expect(result.payoutAt).not.toBeNull();
    expect(store.audits).toContain("settlement.payout_recorded");
  });

  test("rejects empty ref and double payout", async () => {
    const service = new SettlementsService(fakeStore(baseSettlement()));
    await expect(service.recordPayout("s", "o", "a", "  ")).rejects.toThrow(/Transfer reference/);

    const paid = new SettlementsService(
      fakeStore(baseSettlement({ payoutRef: "TX-1", payoutAt: new Date().toISOString() })),
    );
    await expect(paid.recordPayout("s", "o", "a", "TX-2")).rejects.toThrow(/already recorded/);
  });

  test("rejects unknown settlement", async () => {
    const service = new SettlementsService(fakeStore(null));
    await expect(service.recordPayout("missing", "o", "a", "TX-1")).rejects.toThrow(/not found/i);
  });
});
