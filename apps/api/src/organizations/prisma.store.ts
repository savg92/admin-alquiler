import { prisma } from "@admin-alquiler/database";
import type { AuditInput, OrgRow, OrgsStore } from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

export class PrismaOrgsStore implements OrgsStore {
  async findOrgBySlug(slug: string): Promise<{ id: string } | null> {
    return prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  }

  async createOrg(data: {
    slug: string;
    name: string;
    country: string;
    locale: string;
    currency: string;
    timezone: string;
  }): Promise<OrgRow> {
    return prisma.organization.create({ data });
  }

  async ensureAdminRole(
    orgId: string,
    permissions: string[],
  ): Promise<{ id: string; name: string }> {
    const existing = await prisma.role.findUnique({
      where: { orgId_name: { orgId, name: "admin" } },
      select: { id: true, name: true },
    });
    if (existing) {
      return existing;
    }
    const role = await prisma.role.create({
      data: { orgId, name: "admin" },
      select: { id: true, name: true },
    });
    for (const key of permissions) {
      const permission = await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: `Allows ${key}` },
        select: { id: true },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
    return role;
  }

  async createMembership(userId: string, orgId: string, roleId: string): Promise<void> {
    await prisma.membership.create({ data: { userId, orgId, roleId } });
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
