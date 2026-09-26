import { prisma } from "@admin-alquiler/database";
import type { AIModelRow, AiStore, AuditInput, ObservationRow } from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

function toModelRow(row: {
  id: string;
  modelId: string;
  version: string;
  provider: string;
  runtime: string;
  quantization: string | null;
  capabilities: string[];
  contextSize: number | null;
  languages: string[];
  privacyTier: string;
  hardware: unknown;
  status: string;
  score: number | null;
}): AIModelRow {
  return {
    id: row.id,
    modelId: row.modelId,
    version: row.version,
    provider: row.provider,
    runtime: row.runtime,
    quantization: row.quantization,
    capabilities: [...row.capabilities],
    contextSize: row.contextSize,
    languages: [...row.languages],
    privacyTier: row.privacyTier,
    hardware: (row.hardware ?? null) as Record<string, unknown> | null,
    status: row.status,
    score: row.score,
  };
}

export class PrismaAiStore implements AiStore {
  async registerModel(data: {
    modelId: string;
    version: string;
    provider: string;
    runtime: string;
    quantization: string | null;
    capabilities: string[];
    contextSize: number | null;
    languages: string[];
    privacyTier: string;
    hardware: Record<string, unknown> | null;
  }): Promise<AIModelRow> {
    const created = await prisma.aIModel.create({
      data: {
        modelId: data.modelId,
        version: data.version,
        provider: data.provider,
        runtime: data.runtime,
        quantization: data.quantization,
        capabilities: data.capabilities,
        contextSize: data.contextSize,
        languages: data.languages,
        privacyTier: data.privacyTier,
        ...(data.hardware === null ? {} : { hardware: toJsonInput(data.hardware) }),
      },
    });
    return toModelRow(created);
  }

  async listModels(filter: { status?: string; runtime?: string }): Promise<AIModelRow[]> {
    const rows = await prisma.aIModel.findMany({
      where: {
        ...(filter.status === undefined ? {} : { status: filter.status }),
        ...(filter.runtime === undefined ? {} : { runtime: filter.runtime }),
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toModelRow);
  }

  async findModel(modelId: string): Promise<AIModelRow | null> {
    const row = await prisma.aIModel.findUnique({ where: { modelId } });
    return row ? toModelRow(row) : null;
  }

  async setModelStatus(modelId: string, status: string): Promise<AIModelRow> {
    const updated = await prisma.aIModel.update({ where: { modelId }, data: { status } });
    return toModelRow(updated);
  }

  async setModelScore(modelId: string, score: number): Promise<AIModelRow> {
    const updated = await prisma.aIModel.update({ where: { modelId }, data: { score } });
    return toModelRow(updated);
  }

  async recordObservation(data: {
    orgId: string | null;
    modelId: string;
    questionType: string;
    confidence: number;
    correct: boolean;
  }): Promise<ObservationRow> {
    const created = await prisma.aIDecisionObservation.create({
      data: {
        orgId: data.orgId,
        modelId: data.modelId,
        questionType: data.questionType,
        confidence: data.confidence,
        correct: data.correct,
      },
    });
    return {
      id: created.id,
      modelId: created.modelId,
      questionType: created.questionType,
      confidence: created.confidence,
      correct: created.correct,
    };
  }

  async listObservations(
    modelId: string,
    questionType: string,
    since?: Date,
  ): Promise<ObservationRow[]> {
    const rows = await prisma.aIDecisionObservation.findMany({
      where: {
        modelId,
        questionType,
        ...(since === undefined ? {} : { createdAt: { gte: since } }),
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      modelId: row.modelId,
      questionType: row.questionType,
      confidence: row.confidence,
      correct: row.correct,
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
