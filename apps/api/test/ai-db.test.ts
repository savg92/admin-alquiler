import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { prisma } from "@admin-alquiler/database";
import { PrismaAiStore } from "../src/ai/prisma.store";
import { RegistryService } from "../src/ai/registry.service";

async function isDatabaseReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

const dbReachable = await isDatabaseReachable();

describe.skipIf(!dbReachable)("AI registry against a real database", () => {
  const store = new PrismaAiStore();
  const modelId = "db-check-lfm";

  async function seedOrg(): Promise<{ orgId: string; actorId: string }> {
    const org = await prisma.organization.findUnique({
      where: { slug: "ejemplo-co" },
      select: { id: true },
    });
    const actor = await prisma.user.findUnique({
      where: { email: "admin@ejemplo.co" },
      select: { id: true },
    });
    return { orgId: org?.id ?? "", actorId: actor?.id ?? "" };
  }

  test("a model round-trips arrays, JSON and nullable columns", async () => {
    await prisma.aIModel.deleteMany({ where: { modelId } });
    const created = await store.registerModel({
      modelId,
      version: "1.2.0",
      provider: "liquid",
      runtime: "local",
      quantization: null,
      capabilities: ["text", "embedding", "vision"],
      contextSize: 32768,
      languages: ["es", "en"],
      privacyTier: "local-only",
      hardware: { minMemoryMb: 4096, accelerator: "webgpu" },
    });
    expect(created.status).toBe("candidate");
    expect(created.capabilities).toEqual(["text", "embedding", "vision"]);
    expect(created.languages).toEqual(["es", "en"]);
    expect(created.hardware).toEqual({ minMemoryMb: 4096, accelerator: "webgpu" });
    expect(created.quantization).toBeNull();

    const found = await store.findModel(modelId);
    expect(found?.id).toBe(created.id);
    expect(found?.contextSize).toBe(32768);
  });

  test("listing filters by status and runtime", async () => {
    const candidates = await store.listModels({ status: "candidate" });
    expect(candidates.map((row) => row.modelId)).toContain(modelId);
    const byRuntime = await store.listModels({ runtime: "local" });
    expect(byRuntime.map((row) => row.modelId)).toContain(modelId);
    const byProvider = await store.listModels({ runtime: "webgpu" });
    expect(byProvider.map((row) => row.modelId)).not.toContain(modelId);
  });

  test("lifecycle and score updates persist", async () => {
    const updated = await store.setModelStatus(modelId, "installed");
    expect(updated.status).toBe("installed");
    const scored = await store.setModelScore(modelId, 0.77);
    expect(scored.score).toBeCloseTo(0.77, 5);
    const found = await store.findModel(modelId);
    expect(found?.status).toBe("installed");
    expect(found?.score).toBeCloseTo(0.77, 5);
  });

  test("the unique model id is enforced by the database", async () => {
    await expect(
      store.registerModel({
        modelId,
        version: "9.9.9",
        provider: "other",
        runtime: "provider",
        quantization: "q4",
        capabilities: [],
        contextSize: null,
        languages: [],
        privacyTier: "provider-allowed",
        hardware: null,
      }),
    ).rejects.toThrow();
  });

  test("observations persist per model and question type", async () => {
    const { orgId, actorId } = await seedOrg();
    await prisma.aIDecisionObservation.deleteMany({ where: { modelId } });
    for (const sample of [
      { confidence: 0.91, correct: true },
      { confidence: 0.42, correct: false },
    ]) {
      const saved = await store.recordObservation({
        orgId,
        modelId,
        questionType: "triage",
        ...sample,
      });
      expect(saved.id).toBeDefined();
    }
    const rows = await store.listObservations(modelId, "triage");
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.correct)).toHaveLength(1);
    const other = await store.listObservations(modelId, "dunning");
    expect(other).toHaveLength(0);
    expect(actorId).not.toBe("");
  });

  test("the registry service writes a real audit trail", async () => {
    const { orgId, actorId } = await seedOrg();
    await prisma.aIModel.deleteMany({ where: { modelId: `${modelId}-svc` } });
    const service = new RegistryService(store);
    const registered = await service.registerModel(orgId, actorId, {
      modelId: `${modelId}-svc`,
      version: "1.0.0",
      provider: "self-hosted",
      runtime: "local",
      languages: ["es"],
    });
    expect(registered.status).toBe("candidate");
    const events = await prisma.auditEvent.findMany({
      where: { entityType: "AIModel", entityId: registered.id },
      select: { action: true, actorId: true, orgId: true },
    });
    expect(events.map((event) => event.action)).toContain("ai.model_registered");
    expect(events[0]?.actorId).toBe(actorId);
    expect(events[0]?.orgId).toBe(orgId);
  });

  test("an audit event with an unknown actor is rejected by the foreign key", async () => {
    const { orgId } = await seedOrg();
    await expect(
      store.writeAuditEvent({
        orgId,
        actorId: "no-such-user",
        action: "ai.call",
        entityType: "AiCall",
      }),
    ).rejects.toThrow();
  });
});
