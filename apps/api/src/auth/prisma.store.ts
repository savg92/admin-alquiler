import { prisma } from "@admin-alquiler/database";
import type { AuditInput, AuthStore, MembershipRow, SessionRow, UserRow } from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

export class PrismaAuthStore implements AuthStore {
  async findUserByEmail(email: string): Promise<UserRow | null> {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, name: true },
    });
  }

  async findUserById(id: string): Promise<UserRow | null> {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, passwordHash: true, name: true },
    });
  }

  async createSession(data: { userId: string; expiresAt: Date }): Promise<{ id: string }> {
    const created = await prisma.session.create({
      data: { userId: data.userId, expiresAt: data.expiresAt },
      select: { id: true },
    });
    return created;
  }

  async findSessionById(id: string): Promise<SessionRow | null> {
    return prisma.session.findUnique({
      where: { id },
      select: { id: true, userId: true, expiresAt: true, rotatedAt: true },
    });
  }

  async touchSession(id: string, rotatedAt: Date, expiresAt: Date): Promise<void> {
    await prisma.session.update({ where: { id }, data: { rotatedAt, expiresAt } });
  }

  async deleteSession(id: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id } });
  }

  async listMemberships(userId: string): Promise<MembershipRow[]> {
    const rows = await prisma.membership.findMany({
      where: { userId },
      select: {
        orgId: true,
        status: true,
        role: {
          select: {
            name: true,
            grants: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
    return rows.map((row) => ({
      orgId: row.orgId,
      status: row.status,
      roleName: row.role.name,
      permissions: row.role.grants.map((grant) => grant.permission.key),
    }));
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
