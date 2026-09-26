import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  setupChecklist,
  tenancyPeriodsOverlap,
  validateAttachment,
  validateBulkUnits,
  validateConfigRecord,
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

  async updatePropertyConfig(
    id: string,
    orgId: string,
    actorId: string,
    config: unknown,
  ): Promise<PropertyDetail> {
    let record: Record<string, unknown>;
    try {
      record = validateConfigRecord(config, "config");
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid config.");
    }
    const updated = await this.store.updatePropertyConfig(id, orgId, record);
    if (!updated) {
      throw new NotFoundException("Property not found.");
    }
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "property.config_updated",
        entityType: "Property",
        entityId: id,
      }),
    );
    return updated;
  }

  async updateUnitConfig(
    unitId: string,
    orgId: string,
    actorId: string,
    config: unknown,
  ): Promise<{ id: string; code: string; subtype: string }> {
    let record: Record<string, unknown>;
    try {
      record = validateConfigRecord(config, "config");
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid config.");
    }
    const updated = await this.store.updateUnitConfig(unitId, orgId, record);
    if (!updated) {
      throw new NotFoundException("Unit not found.");
    }
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "unit.config_updated",
        entityType: "Unit",
        entityId: unitId,
      }),
    );
    return updated;
  }

  async getProperty(id: string, orgId: string): Promise<PropertyDetail> {
    const found = await this.store.findProperty(id, orgId);
    if (!found) {
      throw new NotFoundException("Property not found.");
    }
    return found;
  }

  async addAttachment(
    orgId: string,
    actorId: string,
    propertyId: string,
    input: {
      unitId?: string | undefined;
      kind: unknown;
      storageKey: unknown;
      mimeType: unknown;
      sizeBytes: unknown;
      capturedAt?: unknown;
    },
  ) {
    const property = await this.getProperty(propertyId, orgId);
    let valid;
    try {
      valid = validateAttachment(input);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid attachment.");
    }
    if (valid.unitId && !property.units.some((unit) => unit.id === valid.unitId)) {
      throw new BadRequestException("Unit does not belong to this property.");
    }
    const created = await this.store.createAttachment({
      orgId,
      propertyId,
      unitId: valid.unitId,
      kind: valid.kind,
      storageKey: valid.storageKey,
      mimeType: valid.mimeType,
      sizeBytes: valid.sizeBytes,
      capturedAt: valid.capturedAt,
      createdBy: actorId,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "property.attachment.added",
        entityType: "PropertyAttachment",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listAttachments(propertyId: string, orgId: string) {
    const rows = await this.store.listAttachments(propertyId, orgId);
    if (!rows) {
      throw new NotFoundException("Property not found.");
    }
    return rows;
  }

  async deleteAttachment(id: string, orgId: string, actorId: string) {
    const deleted = await this.store.deleteAttachment(id, orgId);
    if (!deleted) {
      throw new NotFoundException("Attachment not found.");
    }
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "property.attachment.removed",
        entityType: "PropertyAttachment",
        entityId: id,
      }),
    );
    return { deleted: true };
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
