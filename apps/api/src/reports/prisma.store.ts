import { prisma } from "@admin-alquiler/database";
import type {
  DueChargeRow,
  ExpiringContractRow,
  MaintenanceCaseRow,
  PropertyUnitsRow,
  ReportsStore,
  SettlementSliceRow,
  TenancyOverlapRow,
} from "./store";

const toMinor = (value: { toNumber(): number }): number => Math.round(value.toNumber() * 100);

export class PrismaReportsStore implements ReportsStore {
  async listPropertiesWithUnits(orgId: string): Promise<PropertyUnitsRow[]> {
    const rows = await prisma.property.findMany({
      where: { orgId },
      select: { id: true, units: { select: { id: true } } },
    });
    return rows.map((row) => ({ id: row.id, unitIds: row.units.map((unit) => unit.id) }));
  }

  async tenanciesOverlapping(orgId: string, from: Date, to: Date): Promise<TenancyOverlapRow[]> {
    const rows = await prisma.tenancy.findMany({
      where: {
        orgId,
        startDate: { lt: to },
        OR: [{ endDate: null }, { endDate: { gte: from } }],
      },
      select: { propertyId: true, unitId: true },
    });
    return rows;
  }

  async contractsEnding(orgId: string, from: Date, to: Date): Promise<ExpiringContractRow[]> {
    const rows = await prisma.contract.findMany({
      where: { orgId, endDate: { gte: from, lte: to } },
      select: { id: true, number: true, endDate: true },
      orderBy: { endDate: "asc" },
    });
    return rows;
  }

  async chargesDue(orgId: string, before: Date): Promise<DueChargeRow[]> {
    const rows = await prisma.charge.findMany({
      where: { orgId, dueDate: { lt: before } },
      select: { amount: true, dueDate: true, allocations: { select: { amount: true } } },
      orderBy: { dueDate: "asc" },
    });
    return rows.map((row) => {
      const paidMinor = row.allocations.reduce((total, item) => total + toMinor(item.amount), 0);
      const amountMinor = toMinor(row.amount);
      return {
        amountMinor,
        balanceMinor: Math.max(0, amountMinor - paidMinor),
        dueDate: row.dueDate,
      };
    });
  }

  async settlementsForPeriod(orgId: string, period: string): Promise<SettlementSliceRow[]> {
    const rows = await prisma.settlement.findMany({
      where: { orgId, period },
      select: {
        propertyId: true,
        collected: true,
        commission: true,
        deductions: true,
        net: true,
        currency: true,
      },
    });
    return rows.map((row) => ({
      propertyId: row.propertyId,
      collectedMinor: toMinor(row.collected),
      commissionMinor: toMinor(row.commission),
      deductionsMinor: toMinor(row.deductions),
      netMinor: toMinor(row.net),
      currency: row.currency,
    }));
  }

  async maintenanceCases(orgId: string): Promise<MaintenanceCaseRow[]> {
    const rows = await prisma.maintenanceRequest.findMany({
      where: { orgId },
      select: { propertyId: true, status: true, createdAt: true, updatedAt: true },
    });
    return rows;
  }
}
