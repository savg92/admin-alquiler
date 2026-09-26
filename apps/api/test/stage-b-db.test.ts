import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { prisma } from "@admin-alquiler/database";
import { OrganizationsService } from "../src/organizations/organizations.service";
import { PrismaOrgsStore } from "../src/organizations/prisma.store";
import { PrismaSettlementsStore } from "../src/settlements/prisma.store";
import { SettlementsService } from "../src/settlements/settlements.service";

async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const dbReachable = await isDatabaseReachable();

describe.skipIf(!dbReachable)("Stage B against a real database", () => {
  test("organization creation assigns the caller as admin", async () => {
    const admin = await prisma.user.findUnique({
      where: { email: "admin@ejemplo.co" },
      select: { id: true },
    });
    expect(admin).not.toBeNull();
    const service = new OrganizationsService(new PrismaOrgsStore());
    const org = await service.createOrganization(admin?.id ?? "", {
      name: `E2E DB ${Date.now()}`,
    });
    expect(org.slug.startsWith("e2e-db-")).toBe(true);
    const membership = await prisma.membership.findFirst({
      where: { userId: admin?.id ?? "", orgId: org.id },
      select: { role: { select: { name: true } } },
    });
    expect(membership?.role.name).toBe("admin");
  });

  test("settlement on seeded data splits collected rent by ownership", async () => {
    const org = await prisma.organization.findUnique({
      where: { slug: "ejemplo-co" },
      select: { id: true },
    });
    expect(org).not.toBeNull();
    const property = await prisma.property.findFirst({
      where: { orgId: org?.id ?? "" },
      select: { id: true },
    });
    expect(property).not.toBeNull();
    const actor = await prisma.user.findUnique({
      where: { email: "admin@ejemplo.co" },
      select: { id: true },
    });
    expect(actor).not.toBeNull();
    await prisma.settlement.deleteMany({
      where: { propertyId: property?.id ?? "", period: "2026-02" },
    });
    const service = new SettlementsService(new PrismaSettlementsStore());
    const { settlement, created } = await service.generateSettlement(
      org?.id ?? "",
      actor?.id ?? "",
      property?.id ?? "",
      "2026-02",
    );
    expect(created).toBe(true);
    expect(settlement.collectedMinor).toBe(180000000);
    expect(settlement.netMinor).toBe(settlement.collectedMinor - settlement.commissionMinor);
    expect(
      settlement.lines.map((line) => line.netMinor).reduce((total, net) => total + net, 0),
    ).toBe(settlement.netMinor);
    const audited = await prisma.auditEvent.findFirst({
      where: { entityType: "Settlement", entityId: settlement.id },
      select: { actorId: true, action: true },
    });
    expect(audited?.action).toBe("settlement.generated");
    expect(audited?.actorId).toBe(actor?.id ?? "");
  });
});
