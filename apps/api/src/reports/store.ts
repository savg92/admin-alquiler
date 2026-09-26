export interface PropertyUnitsRow {
  id: string;
  unitIds: string[];
}

export interface TenancyOverlapRow {
  propertyId: string;
  unitId: string | null;
}

export interface ExpiringContractRow {
  id: string;
  number: string;
  endDate: Date;
}

export interface DueChargeRow {
  amountMinor: number;
  balanceMinor: number;
  dueDate: Date;
}

export interface SettlementSliceRow {
  propertyId: string;
  collectedMinor: number;
  commissionMinor: number;
  deductionsMinor: number;
  netMinor: number;
  currency: string;
}

export interface MaintenanceCaseRow {
  propertyId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportsStore {
  listPropertiesWithUnits(orgId: string): Promise<PropertyUnitsRow[]>;
  tenanciesOverlapping(orgId: string, from: Date, to: Date): Promise<TenancyOverlapRow[]>;
  contractsEnding(orgId: string, from: Date, to: Date): Promise<ExpiringContractRow[]>;
  chargesDue(orgId: string, before: Date): Promise<DueChargeRow[]>;
  settlementsForPeriod(orgId: string, period: string): Promise<SettlementSliceRow[]>;
  maintenanceCases(orgId: string): Promise<MaintenanceCaseRow[]>;
}
