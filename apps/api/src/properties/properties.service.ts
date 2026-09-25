import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  setupChecklist,
  tenancyPeriodsOverlap,
  validateBulkUnits,
  type SetupChecklist,
} from "@admin-alquiler/domain";
import { PROPERTIES_STORE } from "./tokens";
import type {
  CreatePropertyInput,
  OwnerInput,
  PropertiesStore,
  PropertyDetail,
  PropertyRow,
  TenantInput,
} from "./store";

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`Invalid date for "${field}".`);
  }
  return new Date(value);
}

@Injectable()
export class PropertiesService {
  constructor(@Inject(PROPERTIES_STORE) private readonly store: PropertiesStore) {}

  async createPropertyWithUnits(
    orgId: string,
    actorId: string,
    input: CreatePropertyInput,
  ): Promise<PropertyDetail> {
    if (input.name.trim().length === 0 || input.address.trim().length === 0) {
      throw new BadRequestException("Property name and address are required.");
    }
    try {
      validateBulkUnits(input.units);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid units.");
    }
    const created = await this.store.createProperty(orgId, input);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "property.created",
        entityType: "Property",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listProperties(orgId: string): Promise<PropertyRow[]> {
    return this.store.listProperties(orgId);
  }

  async getProperty(id: string, orgId: string): Promise<PropertyDetail> {
    const found = await this.store.findProperty(id, orgId);
    if (!found) {
      throw new NotFoundException("Property not found.");
    }
    return found;
  }

  async setupStatus(id: string, orgId: string): Promise<SetupChecklist> {
    await this.getProperty(id, orgId);
    const [ownershipTotalPct, tenancyCount, property] = await Promise.all([
      this.store.ownershipTotalPct(id),
      this.store.tenancyCount(id),
      this.store.findProperty(id, orgId),
    ]);
    return setupChecklist({
      unitCount: property?.units.length ?? 0,
      ownershipTotalPct,
      tenancyCount,
    });
  }

  async addOwnerWithShare(
    orgId: string,
    actorId: string,
    propertyId: string,
    input: OwnerInput,
  ): Promise<{ id: string }> {
    await this.getProperty(propertyId, orgId);
    if (input.name.trim().length === 0) {
      throw new BadRequestException("Owner name is required.");
    }
    if (!(input.sharePct > 0) || input.sharePct > 100) {
      throw new BadRequestException("Share must be greater than 0 and at most 100.");
    }
    const total = await this.store.ownershipTotalPct(propertyId);
    if (total + input.sharePct - 100 > 1e-9) {
      throw new BadRequestException(`Share exceeds the remaining ${100 - total}%.`);
    }
    const startDate = parseDate(input.startDate, "startDate");
    const owner = await this.store.createOwner(orgId, input.name.trim(), input.taxId ?? null);
    await this.store.assignOwnership({
      propertyId,
      ownerId: owner.id,
      sharePct: input.sharePct,
      startDate,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "property.owner.added",
        entityType: "PropertyOwnership",
        entityId: owner.id,
      }),
    );
    return owner;
  }

  async addTenantWithTenancy(
    orgId: string,
    actorId: string,
    propertyId: string,
    input: TenantInput,
  ): Promise<{ id: string }> {
    const property = await this.getProperty(propertyId, orgId);
    if (input.name.trim().length === 0) {
      throw new BadRequestException("Tenant name is required.");
    }
    if (input.unitId !== undefined) {
      const belongs = property.units.some((unit) => unit.id === input.unitId);
      if (!belongs) {
        throw new BadRequestException("Unit does not belong to this property.");
      }
      const existing = await this.store.unitTenancyPeriods(input.unitId);
      const candidate = {
        startDate: input.startDate,
        endDate: input.endDate ?? null,
      };
      parseDate(input.startDate, "startDate");
      if (input.endDate !== undefined) {
        parseDate(input.endDate, "endDate");
      }
      for (const period of existing) {
        if (tenancyPeriodsOverlap(period, candidate)) {
          throw new BadRequestException("Unit already has a tenancy overlapping this period.");
        }
      }
    }
    const tenant = await this.store.createTenant(orgId, input.name.trim());
    await this.store.createTenancy({
      orgId,
      propertyId,
      unitId: input.unitId ?? null,
      tenantId: tenant.id,
      startDate: parseDate(input.startDate, "startDate"),
      endDate: input.endDate === undefined ? null : parseDate(input.endDate, "endDate"),
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "property.tenant.added",
        entityType: "Tenancy",
        entityId: tenant.id,
      }),
    );
    return tenant;
  }
}
