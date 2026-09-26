import { prisma } from "@admin-alquiler/database";
import type { AuditEventRow, AuditStore } from "./store";

export class PrismaAuditStore implements AuditStore {
  async listAuditEvents(
    orgId: string,
    filter: { entityType?: string; entityId?: string; action?: string; limit?: number },
  ): Promise<AuditEventRow[]> {
    const rows = await prisma.auditEvent.findMany({
      where: {
        orgId,
        ...(filter.entityType === undefined ? {} : { entityType: filter.entityType }),
        ...(filter.entityId === undefined ? {} : { entityId: filter.entityId }),
        ...(filter.action === undefined ? {} : { action: filter.action }),
      },
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 100,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: row.actorId,
      createdAt: row.createdAt,
    }));
  }
}
