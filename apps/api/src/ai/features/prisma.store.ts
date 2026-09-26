import { prisma } from "@admin-alquiler/database";
import type { AiSuggestionStore, SuggestionInput, SuggestionRow, SuggestionStatus } from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

type RawRow = {
  id: string;
  orgId: string;
  actorId: string;
  feature: string;
  status: string;
  payload: unknown;
  confidence: number | null;
  requiresConfirmation: boolean;
  sourceRuntime: string | null;
  sourceModel: string | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  createdAt: Date;
};

function toRow(row: RawRow): SuggestionRow {
  return {
    id: row.id,
    orgId: row.orgId,
    actorId: row.actorId,
    feature: row.feature,
    status: row.status as SuggestionStatus,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    confidence: row.confidence,
    requiresConfirmation: row.requiresConfirmation,
    sourceRuntime: row.sourceRuntime,
    sourceModel: row.sourceModel,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    createdAt: row.createdAt,
  };
}

export class PrismaAiSuggestionStore implements AiSuggestionStore {
  async create(data: SuggestionInput): Promise<SuggestionRow> {
    const created = await prisma.aISuggestion.create({
      data: {
        orgId: data.orgId,
        actorId: data.actorId,
        feature: data.feature,
        payload: toJsonInput(data.payload),
        confidence: data.confidence,
        requiresConfirmation: data.requiresConfirmation,
        sourceRuntime: data.sourceRuntime,
        sourceModel: data.sourceModel,
      },
    });
    return toRow(created);
  }

  async find(id: string, orgId: string): Promise<SuggestionRow | null> {
    const row = await prisma.aISuggestion.findFirst({ where: { id, orgId } });
    return row ? toRow(row) : null;
  }

  async list(
    orgId: string,
    filter: { feature?: string; status?: SuggestionStatus },
  ): Promise<SuggestionRow[]> {
    const rows = await prisma.aISuggestion.findMany({
      where: {
        orgId,
        ...(filter.feature === undefined ? {} : { feature: filter.feature }),
        ...(filter.status === undefined ? {} : { status: filter.status }),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toRow);
  }

  async decide(
    id: string,
    orgId: string,
    status: SuggestionStatus,
    decidedBy: string,
  ): Promise<SuggestionRow | null> {
    const updated = await prisma.aISuggestion.updateMany({
      where: { id, orgId, status: "PENDING" },
      data: { status, decidedBy, decidedAt: new Date() },
    });
    if (updated.count === 0) {
      return null;
    }
    const row = await prisma.aISuggestion.findFirst({ where: { id, orgId } });
    return row ? toRow(row) : null;
  }

  async writeAuditEvent(event: {
    orgId?: string;
    actorId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
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
