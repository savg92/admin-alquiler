import { prisma } from "@admin-alquiler/database";
import type {
  CreatePropertyInput,
  OrgDefaults,
  PropertiesStore,
  PropertyDetail,
  PropertyRow,
} from "./store";
import type { AuditInput } from "./store";
import type { TenancyPeriod } from "@admin-alquiler/domain";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

export class PrismaPropertiesStore implements PropertiesStore {
  async findOrgDefaults(orgId: string): Promise<OrgDefaults | null> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { country: true, locale: true, currency: true },
    });
    return org;
  }

  async createProperty(orgId: string, input: CreatePropertyInput): Promise<PropertyDetail> {
    const defaults = await this.findOrgDefaults(orgId);
    const created = await prisma.property.create({
      data: {
        orgId,
        name: input.name,
        address: input.address,
        city: input.city,
        country: defaults?.country ?? "CO",
        phEnabled: input.phEnabled,
        units: {
          create: input.units.map((unit) => ({
            code: unit.code.trim(),
            subtype: unit.subtype as "RESIDENTIAL" | "OFFICE" | "PARKING" | "STORAGE",
            ...(unit.areaM2 === undefined ? {} : { areaM2: unit.areaM2 }),
          })),
        },
      },
      include: { units: { select: { id: true, code: true, subtype: true } } },
    });
    return {
      id: created.id,
      orgId: created.orgId,
      name: created.name,
      address: created.address,
      city: created.city,
      country: created.country,
      phEnabled: created.phEnabled,
      units: created.units,
    };
  }

  async listProperties(orgId: string): Promise<PropertyRow[]> {
    return prisma.property.findMany({
      where: { orgId },
      select: {
        id: true,
        orgId: true,
        name: true,
        address: true,
        city: true,
        country: true,
        phEnabled: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async findProperty(id: string, orgId: string): Promise<PropertyDetail | null> {
    const found = await prisma.property.findFirst({
      where: { id, orgId },
      include: { units: { select: { id: true, code: true, subtype: true } } },
    });
    if (!found) {
      return null;
    }
    return {
      id: found.id,
      orgId: found.orgId,
      name: found.name,
      address: found.address,
      city: found.city,
      country: found.country,
      phEnabled: found.phEnabled,
      units: found.units,
    };
  }

  async unitTenancyPeriods(unitId: string): Promise<TenancyPeriod[]> {
    const rows = await prisma.tenancy.findMany({
      where: { unitId },
      select: { startDate: true, endDate: true },
    });
    return rows.map((row) => ({
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    }));
  }

  async ownershipTotalPct(propertyId: string): Promise<number> {
    const rows = await prisma.propertyOwnership.findMany({
      where: { propertyId, endDate: null },
      select: { sharePct: true },
    });
    return rows.reduce((total, row) => total + row.sharePct.toNumber(), 0);
  }

  async tenancyCount(propertyId: string): Promise<number> {
    return prisma.tenancy.count({ where: { propertyId } });
  }

  async createOwner(orgId: string, name: string, taxId: string | null): Promise<{ id: string }> {
    const created = await prisma.owner.create({
      data: { orgId, name, taxId },
      select: { id: true },
    });
    return created;
  }

  async assignOwnership(data: {
    propertyId: string;
    ownerId: string;
    sharePct: number;
    startDate: Date;
  }): Promise<void> {
    await prisma.propertyOwnership.create({
      data: {
        propertyId: data.propertyId,
        ownerId: data.ownerId,
        sharePct: data.sharePct,
        startDate: data.startDate,
      },
    });
  }

  async createTenant(orgId: string, name: string): Promise<{ id: string }> {
    const created = await prisma.tenant.create({
      data: { orgId, name },
      select: { id: true },
    });
    return created;
  }

  async createTenancy(data: {
    orgId: string;
    propertyId: string;
    unitId: string | null;
    tenantId: string;
    startDate: Date;
    endDate: Date | null;
  }): Promise<{ id: string }> {
    const created = await prisma.tenancy.create({
      data: {
        orgId: data.orgId,
        propertyId: data.propertyId,
        unitId: data.unitId,
        tenantId: data.tenantId,
        startDate: data.startDate,
        endDate: data.endDate,
      },
      select: { id: true },
    });
    return created;
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
