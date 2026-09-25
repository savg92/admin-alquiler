export interface OwnershipShare {
  ownerId: string;
  sharePct: number;
}

export interface SettlementLineInput {
  ownerId: string;
  sharePct: number;
  grossMinor: number;
  netMinor: number;
}

export interface SettlementDetail {
  id: string;
  propertyId: string;
  period: string;
  collectedMinor: number;
  commissionMinor: number;
  deductionsMinor: number;
  netMinor: number;
  currency: string;
  lines: SettlementLineInput[];
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface SettlementsStore {
  findProperty(propertyId: string, orgId: string): Promise<{ id: string } | null>;
  findOrgCurrency(orgId: string): Promise<string | null>;
  paymentsTotalMinor(propertyId: string, from: Date, to: Date): Promise<number>;
  activeOwnershipShares(propertyId: string): Promise<OwnershipShare[]>;
  findCommissionPct(orgId: string, propertyId: string): Promise<number>;
  findSettlement(propertyId: string, period: string): Promise<SettlementDetail | null>;
  findSettlementById(id: string, orgId: string): Promise<SettlementDetail | null>;
  createSettlement(data: {
    orgId: string;
    propertyId: string;
    period: string;
    collectedMinor: number;
    commissionMinor: number;
    deductionsMinor: number;
    netMinor: number;
    currency: string;
    lines: SettlementLineInput[];
  }): Promise<SettlementDetail>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
