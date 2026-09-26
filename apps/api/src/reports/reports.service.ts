import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  delinquencyRate,
  maintenanceSla,
  occupancyRate,
  upcomingExpirations,
} from "@admin-alquiler/domain";
import { REPORTS_STORE } from "./tokens";
import type { ReportsStore } from "./store";

@Injectable()
export class ReportsService {
  constructor(@Inject(REPORTS_STORE) private readonly store: ReportsStore) {}

  async kpis(orgId: string, period: string) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(`Invalid period "${period}". Expected "YYYY-MM".`);
    }
    const [year, month] = period.split("-").map(Number) as [number, number];
    if (month < 1 || month > 12) {
      throw new BadRequestException(`Invalid period "${period}". Expected "YYYY-MM".`);
    }
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));
    const horizonEnd = new Date(periodEnd.getTime() + 90 * 86_400_000);

    const properties = await this.store.listPropertiesWithUnits(orgId);
    const totalUnits = properties.reduce((total, property) => total + property.unitIds.length, 0);
    const tenancies = await this.store.tenanciesOverlapping(orgId, periodStart, periodEnd);
    const occupiedUnits = new Set(
      tenancies.filter((tenancy) => tenancy.unitId !== null).map((tenancy) => tenancy.unitId),
    ).size;

    const charges = await this.store.chargesDue(orgId, periodEnd);
    const totalBilledMinor = charges.reduce((total, charge) => total + charge.amountMinor, 0);
    const overdueMinor = charges
      .filter((charge) => charge.dueDate < periodStart && charge.balanceMinor > 0)
      .reduce((total, charge) => total + charge.balanceMinor, 0);

    const ending = await this.store.contractsEnding(orgId, periodStart, horizonEnd);
    const expirations = upcomingExpirations(
      ending.map((contract) => ({
        id: contract.id,
        endDate: contract.endDate.toISOString().slice(0, 10),
      })),
      periodStart.getTime(),
      90,
    ).map((entry) => {
      const contract = ending.find((item) => item.id === entry.id);
      const daysRemaining = Math.ceil(
        (Date.parse(entry.endDate) - periodStart.getTime()) / 86_400_000,
      );
      return { ...entry, number: contract?.number ?? "", daysRemaining };
    });

    const cases = await this.store.maintenanceCases(orgId);
    const sla = maintenanceSla(
      cases.map((item) => ({
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    );

    const slices = await this.store.settlementsForPeriod(orgId, period);
    const perPropertyPnl = properties.map((property) => {
      const slice = slices.find((item) => item.propertyId === property.id);
      return {
        propertyId: property.id,
        collectedMinor: slice?.collectedMinor ?? 0,
        commissionMinor: slice?.commissionMinor ?? 0,
        deductionsMinor: slice?.deductionsMinor ?? 0,
        netMinor: slice?.netMinor ?? 0,
        currency: slice?.currency ?? "COP",
      };
    });

    return {
      period,
      occupancy: occupancyRate({ totalUnits, occupiedUnits }),
      occupiedUnits,
      totalUnits,
      delinquencyRate: delinquencyRate({ overdueMinor, totalBilledMinor }),
      overdueMinor,
      totalBilledMinor,
      upcomingExpirations: expirations,
      maintenanceSla: sla,
      perPropertyPnl,
    };
  }
}
