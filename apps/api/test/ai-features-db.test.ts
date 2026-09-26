import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { prisma } from "@admin-alquiler/database";
import { PrismaAiSuggestionStore } from "../src/ai/features/prisma.store";

async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const dbReachable = await isDatabaseReachable();

describe.skipIf(!dbReachable)("AI suggestions against a real database", () => {
  const store = new PrismaAiSuggestionStore();

  async function context(): Promise<{ orgId: string; actorId: string }> {
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

  test("a suggestion round-trips its JSON payload", async () => {
    const { orgId, actorId } = await context();
    const created = await store.create({
      orgId,
      actorId,
      feature: "extraction",
      payload: { documentType: "lease", monthlyRentMinor: 1200000 },
      confidence: 0.82,
      requiresConfirmation: true,
      sourceRuntime: "local",
      sourceModel: "lfm2.5-1.2b",
    });
    expect(created.status).toBe("PENDING");
    expect(created.requiresConfirmation).toBe(true);
    expect(created.payload).toEqual({ documentType: "lease", monthlyRentMinor: 1200000 });
    const found = await store.find(created.id, orgId);
    expect(found?.payload["monthlyRentMinor"]).toBe(1200000);
    expect(found?.decidedAt).toBeNull();
  });

  test("a suggestion is invisible to another organization", async () => {
    const { orgId, actorId } = await context();
    const created = await store.create({
      orgId,
      actorId,
      feature: "summarization",
      payload: { text: "resumen" },
      confidence: null,
      requiresConfirmation: false,
      sourceRuntime: "local",
      sourceModel: "m",
    });
    expect(await store.find(created.id, "otra-org")).toBeNull();
    const otherOrg = await prisma.organization.findFirst({
      where: { NOT: { id: orgId } },
      select: { id: true },
    });
    if (otherOrg !== null) {
      expect(await store.find(created.id, otherOrg.id)).toBeNull();
    }
  });

  test("deciding is atomic: only the first decision wins", async () => {
    const { orgId, actorId } = await context();
    const created = await store.create({
      orgId,
      actorId,
      feature: "document-draft",
      payload: { text: "borrador" },
      confidence: null,
      requiresConfirmation: true,
      sourceRuntime: "local",
      sourceModel: "m",
    });
    const first = await store.decide(created.id, orgId, "CONFIRMED", actorId);
    expect(first?.status).toBe("CONFIRMED");
    expect(first?.decidedBy).toBe(actorId);
    expect(first?.decidedAt).not.toBeNull();
    const second = await store.decide(created.id, orgId, "REJECTED", actorId);
    expect(second).toBeNull();
    const unchanged = await store.find(created.id, orgId);
    expect(unchanged?.status).toBe("CONFIRMED");
  });

  test("another organization cannot decide a suggestion", async () => {
    const { orgId, actorId } = await context();
    const created = await store.create({
      orgId,
      actorId,
      feature: "classification",
      payload: { category: "plumbing" },
      confidence: null,
      requiresConfirmation: false,
      sourceRuntime: "local",
      sourceModel: "m",
    });
    expect(await store.decide(created.id, "otra-org", "CONFIRMED", actorId)).toBeNull();
    const stillPending = await store.find(created.id, orgId);
    expect(stillPending?.status).toBe("PENDING");
  });

  test("listing filters by feature and status", async () => {
    const { orgId, actorId } = await context();
    const created = await store.create({
      orgId,
      actorId,
      feature: "vision",
      payload: { description: "foto" },
      confidence: null,
      requiresConfirmation: true,
      sourceRuntime: "local",
      sourceModel: "m",
    });
    const byFeature = await store.list(orgId, { feature: "vision" });
    expect(byFeature.map((row) => row.id)).toContain(created.id);
    const confirmed = await store.list(orgId, { status: "CONFIRMED" });
    expect(confirmed.every((row) => row.status === "CONFIRMED")).toBe(true);
    expect(confirmed.map((row) => row.id)).not.toContain(created.id);
  });

  test("a suggestion for an unknown actor is rejected by the foreign key", async () => {
    const { orgId } = await context();
    await expect(
      store.create({
        orgId,
        actorId: "no-such-user",
        feature: "summarization",
        payload: {},
        confidence: null,
        requiresConfirmation: false,
        sourceRuntime: null,
        sourceModel: null,
      }),
    ).rejects.toThrow();
  });
});
