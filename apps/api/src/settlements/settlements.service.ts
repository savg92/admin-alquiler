import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { buildAuditEvent, periodDueDate, validateTransferRef } from "@admin-alquiler/domain";
import { SETTLEMENTS_STORE } from "./tokens";
import type { SettlementDetail, SettlementLineInput, SettlementsStore } from "./store";

function monthBounds(period: string): { from: Date; to: Date } {
  const due = periodDueDate(period, 1);
  const year = due.getUTCFullYear();
  const month = due.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1)),
    to: new Date(Date.UTC(year, month + 1, 1)),
  };
}

function splitByShares(
  netMinor: number,
  shares: { ownerId: string; sharePct: number }[],
): SettlementLineInput[] {
  const floors = shares.map((share) => {
    const exact = (netMinor * share.sharePct) / 100;
    return { ...share, floored: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  const flooredTotal = floors.reduce((total, entry) => total + entry.floored, 0);
  let leftover = netMinor - flooredTotal;
  const order = [...floors]
    .sort((a, b) => b.fraction - a.fraction || b.sharePct - a.sharePct)
    .map((entry) => entry.ownerId);
  const extra = new Map<string, number>();
  for (const ownerId of order) {
    if (leftover <= 0) {
      break;
    }
    extra.set(ownerId, 1);
    leftover -= 1;
  }
  return floors.map((entry) => {
    const net = entry.floored + (extra.get(entry.ownerId) ?? 0);
    return {
      ownerId: entry.ownerId,
      sharePct: entry.sharePct,
      grossMinor: net,
      netMinor: net,
    };
  });
}

@Injectable()
export class SettlementsService {
  constructor(@Inject(SETTLEMENTS_STORE) private readonly store: SettlementsStore) {}

  async generateSettlement(
    orgId: string,
    actorId: string,
    propertyId: string,
    period: string,
  ): Promise<{ settlement: SettlementDetail; created: boolean }> {
    let bounds: { from: Date; to: Date };
    try {
      bounds = monthBounds(period);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid period.");
    }
    const property = await this.store.findProperty(propertyId, orgId);
    if (!property) {
      throw new NotFoundException("Property not found.");
    }
    const existing = await this.store.findSettlement(propertyId, period);
    if (existing) {
      return { settlement: existing, created: false };
    }
    const currency = await this.store.findOrgCurrency(orgId);
    if (!currency) {
      throw new NotFoundException("Organization not found.");
    }
    const collectedMinor = await this.store.paymentsTotalMinor(propertyId, bounds.from, bounds.to);
    const commissionPct = await this.store.findCommissionPct(orgId, propertyId);
    const commissionMinor = Math.round((collectedMinor * commissionPct) / 100);
    const netMinor = collectedMinor - commissionMinor;
    const shares = await this.store.activeOwnershipShares(propertyId);
    const totalShare = shares.reduce((total, share) => total + share.sharePct, 0);
    if (shares.length === 0 || Math.abs(totalShare - 100) > 1e-9) {
      throw new BadRequestException("Ownership shares must total 100 before settling.");
    }
    const settlement = await this.store.createSettlement({
      orgId,
      propertyId,
      period,
      collectedMinor,
      commissionMinor,
      deductionsMinor: 0,
      netMinor,
      currency,
      lines: splitByShares(netMinor, shares),
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "settlement.generated",
        entityType: "Settlement",
        entityId: settlement.id,
        metadata: { period, collectedMinor, netMinor },
      }),
    );
    return { settlement, created: true };
  }

  async getSettlement(id: string, orgId: string): Promise<SettlementDetail> {
    const found = await this.store.findSettlementById(id, orgId);
    if (!found) {
      throw new NotFoundException("Settlement not found.");
    }
    return found;
  }

  async recordPayout(
    id: string,
    orgId: string,
    actorId: string,
    transferRef: unknown,
  ): Promise<SettlementDetail> {
    let ref: string;
    try {
      ref = validateTransferRef(transferRef);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid payout.");
    }
    const found = await this.store.findSettlementById(id, orgId);
    if (!found) {
      throw new NotFoundException("Settlement not found.");
    }
    if (found.payoutRef) {
      throw new BadRequestException("Settlement payout already recorded.");
    }
    const paidAt = new Date();
    const updated = await this.store.recordPayout(id, ref, paidAt);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "settlement.payout_recorded",
        entityType: "Settlement",
        entityId: id,
        metadata: { transferRef: ref },
      }),
    );
    return updated;
  }
}
