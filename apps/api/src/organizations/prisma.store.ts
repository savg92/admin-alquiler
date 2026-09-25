import { prisma } from "@admin-alquiler/database";
import type { AuditInput, MemberRow, OrgRow, OrgsStore } from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

export class PrismaOrgsStore implements OrgsStore {
  async findOrgBySlug(slug: string): Promise<{ id: string } | null> {
    return prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  }

  async findOrgById(id: string): Promise<{ id: string } | null> {
    return prisma.organization.findUnique({ where: { id }, select: { id: true } });
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

  async listMembers(orgId: string): Promise<MemberRow[]> {
    const rows = await prisma.membership.findMany({
      where: { orgId },
      select: { userId: true, orgId: true, status: true, role: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      userId: row.userId,
      orgId: row.orgId,
      status: row.status,
      roleName: row.role.name,
    }));
  }

  async findMembership(orgId: string, userId: string): Promise<MemberRow | null> {
    const row = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { userId: true, orgId: true, status: true, role: { select: { name: true } } },
    });
    if (!row) {
      return null;
    }
    return { userId: row.userId, orgId: row.orgId, status: row.status, roleName: row.role.name };
  }

  async findRoleByName(orgId: string, name: string): Promise<{ id: string; name: string } | null> {
    return prisma.role.findUnique({
      where: { orgId_name: { orgId, name } },
      select: { id: true, name: true },
    });
  }

  async updateMembership(
    orgId: string,
    userId: string,
    data: { roleId?: string; status?: "ACTIVE" | "SUSPENDED" | "REVOKED" },
  ): Promise<MemberRow> {
    const updated = await prisma.membership.update({
      where: { userId_orgId: { userId, orgId } },
      data: {
        ...(data.roleId === undefined ? {} : { roleId: data.roleId }),
        ...(data.status === undefined ? {} : { status: data.status }),
      },
      select: { userId: true, orgId: true, status: true, role: { select: { name: true } } },
    });
    return {
      userId: updated.userId,
      orgId: updated.orgId,
      status: updated.status,
      roleName: updated.role.name,
    };
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
