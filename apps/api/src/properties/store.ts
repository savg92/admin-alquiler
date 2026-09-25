import type { TenancyPeriod } from "@admin-alquiler/domain";

export interface OrgDefaults {
  country: string;
  locale: string;
  currency: string;
}

export interface UnitInput {
  code: string;
  subtype: string;
  areaM2?: number;
}

export interface UnitRow {
  id: string;
  code: string;
  subtype: string;
  config?: Record<string, unknown> | null | undefined;
}

export interface PropertyRow {
  id: string;
  orgId: string;
  name: string;
  address: string;
  city: string;
  country: string;
  phEnabled: boolean;
}

export interface PropertyDetail extends PropertyRow {
  units: UnitRow[];
  config?: Record<string, unknown> | null | undefined;
}

export interface CreatePropertyInput {
  name: string;
  address: string;
  city: string;
  phEnabled: boolean;
  units: UnitInput[];
}

export interface OwnerInput {
  name: string;
  taxId?: string | undefined;
  sharePct: number;
  startDate: string;
}

export interface TenantInput {
  name: string;
  unitId?: string | undefined;
  startDate: string;
  endDate?: string | undefined;
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface PropertiesStore {
  findOrgDefaults(orgId: string): Promise<OrgDefaults | null>;
  createProperty(orgId: string, input: CreatePropertyInput): Promise<PropertyDetail>;
  listProperties(orgId: string): Promise<PropertyRow[]>;
  findProperty(id: string, orgId: string): Promise<PropertyDetail | null>;
  unitTenancyPeriods(unitId: string): Promise<TenancyPeriod[]>;
  ownershipTotalPct(propertyId: string): Promise<number>;
  tenancyCount(propertyId: string): Promise<number>;
  createOwner(orgId: string, name: string, taxId: string | null): Promise<{ id: string }>;
  assignOwnership(data: {
    propertyId: string;
    ownerId: string;
    sharePct: number;
    startDate: Date;
  }): Promise<void>;
  createTenant(orgId: string, name: string): Promise<{ id: string }>;
  updatePropertyConfig(
    id: string,
    orgId: string,
    config: Record<string, unknown>,
  ): Promise<PropertyDetail | null>;
  updateUnitConfig(
    unitId: string,
    orgId: string,
    config: Record<string, unknown>,
  ): Promise<UnitRow | null>;
  createTenancy(data: {
    orgId: string;
    propertyId: string;
    unitId: string | null;
    tenantId: string;
    startDate: Date;
    endDate: Date | null;
  }): Promise<{ id: string }>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
