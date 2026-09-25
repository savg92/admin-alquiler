import { prisma } from "@admin-alquiler/database";
import type { AuditInput, OwnershipShare, SettlementDetail, SettlementsStore } from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

const toMinor = (value: { toNumber(): number }): number => Math.round(value.toNumber() * 100);

function toDetail(
  settlement: {
    id: string;
    propertyId: string;
    period: string;
    currency: string;
    collected: { toNumber(): number };
    commission: { toNumber(): number };
    deductions: { toNumber(): number };
    net: { toNumber(): number };
    payoutRef: string | null;
    payoutAt: Date | null;
  },
  lines: {
    ownerId: string;
    sharePct: { toNumber(): number };
    gross: { toNumber(): number };
    net: { toNumber(): number };
  }[],
): SettlementDetail {
  return {
    id: settlement.id,
    propertyId: settlement.propertyId,
    period: settlement.period,
    collectedMinor: toMinor(settlement.collected),
    commissionMinor: toMinor(settlement.commission),
    deductionsMinor: toMinor(settlement.deductions),
    netMinor: toMinor(settlement.net),
    currency: settlement.currency,
    payoutRef: settlement.payoutRef,
    payoutAt: settlement.payoutAt?.toISOString() ?? null,
    lines: lines.map((line) => ({
      ownerId: line.ownerId,
      sharePct: line.sharePct.toNumber(),
      grossMinor: toMinor(line.gross),
      netMinor: toMinor(line.net),
    })),
  };
}

export class PrismaSettlementsStore implements SettlementsStore {
  async findProperty(propertyId: string, orgId: string): Promise<{ id: string } | null> {
    return prisma.property.findFirst({ where: { id: propertyId, orgId }, select: { id: true } });
  }

  async findOrgCurrency(orgId: string): Promise<string | null> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { currency: true },
    });
    return org?.currency ?? null;
  }

  async paymentsTotalMinor(propertyId: string, from: Date, to: Date): Promise<number> {
    const rows = await prisma.payment.findMany({
      where: { contract: { propertyId }, paidAt: { gte: from, lt: to } },
      select: { amount: true },
    });
    return rows.reduce((total, row) => total + toMinor(row.amount), 0);
  }

  async activeOwnershipShares(propertyId: string): Promise<OwnershipShare[]> {
    const rows = await prisma.propertyOwnership.findMany({
      where: { propertyId, endDate: null },
      select: { ownerId: true, sharePct: true },
    });
    return rows.map((row) => ({ ownerId: row.ownerId, sharePct: row.sharePct.toNumber() }));
  }

  async findCommissionPct(orgId: string, propertyId: string): Promise<number> {
    const rules = await prisma.commissionRule.findMany({
      where: { orgId },
      select: { scopeType: true, scopeId: true, percentage: true },
    });
    const propertyRule = rules.find(
      (rule) => rule.scopeType === "PROPERTY" && rule.scopeId === propertyId,
    );
    const orgRule = rules.find(
      (rule) =>
        rule.scopeType === "ORGANIZATION" && (rule.scopeId === orgId || rule.scopeId === null),
    );
    const match = propertyRule ?? orgRule;
    return match?.percentage?.toNumber() ?? 0;
  }

  async findSettlement(propertyId: string, period: string): Promise<SettlementDetail | null> {
    const row = await prisma.settlement.findUnique({
      where: { propertyId_period: { propertyId, period } },
      include: { lines: true },
    });
    if (!row) {
      return null;
    }
    return toDetail(row, row.lines);
  }

  async findSettlementById(id: string, orgId: string): Promise<SettlementDetail | null> {
    const row = await prisma.settlement.findFirst({
      where: { id, orgId },
      include: { lines: true },
    });
    if (!row) {
      return null;
    }
    return toDetail(row, row.lines);
  }

  async createSettlement(data: {
    orgId: string;
    propertyId: string;
    period: string;
    collectedMinor: number;
    commissionMinor: number;
    deductionsMinor: number;
    netMinor: number;
    currency: string;
    lines: { ownerId: string; sharePct: number; grossMinor: number; netMinor: number }[];
  }): Promise<SettlementDetail> {
    const created = await prisma.settlement.create({
      data: {
        orgId: data.orgId,
        propertyId: data.propertyId,
        period: data.period,
        collected: data.collectedMinor / 100,
        commission: data.commissionMinor / 100,
        deductions: data.deductionsMinor / 100,
        net: data.netMinor / 100,
        currency: data.currency,
        lines: {
          create: data.lines.map((line) => ({
            ownerId: line.ownerId,
            sharePct: line.sharePct,
            gross: line.grossMinor / 100,
            net: line.netMinor / 100,
          })),
        },
      },
      include: { lines: true },
    });
    return toDetail(created, created.lines);
  }

  async recordPayout(id: string, transferRef: string, paidAt: Date): Promise<SettlementDetail> {
    const updated = await prisma.settlement.update({
      where: { id },
      data: { payoutRef: transferRef, payoutAt: paidAt },
      include: { lines: true },
    });
    return toDetail(updated, updated.lines);
  }

  async writeAuditEvent(event: AuditInput): Promise<void> {
    await prisma.auditEvent.create({
      data: {
        ...(event.orgId === undefined ? {} : { orgId: event.orgId }),
        ...(event.actorId === undefined ? {} : { actorId: event.actorId }),
        action: event.action,
        ...(event.entityType === undefined ? {} : { entityType: event.entityType }),
        ...(event.entityId === undefined ? {} : { entityId: event.entityId }),
        ...(event.metadata === undefined ? {} : { metadata: toJsonInput(event.metadata) }),
      },
    });
  }
}
