import { randomBytes, scryptSync } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { resolveSeedLocale } from "./locales";

function hashPasswordPlaceholder(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main(): Promise<void> {
  const seedLocale = resolveSeedLocale();
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.organization.findUnique({ where: { slug: "ejemplo-co" } });
    if (existing) {
      console.log(`seed: organization "ejemplo-co" already exists, skipping`);
      return;
    }

    const org = await prisma.organization.create({
      data: {
        slug: "ejemplo-co",
        name: "Inmobiliaria Ejemplo",
        country: seedLocale.country,
        locale: seedLocale.locale,
        currency: seedLocale.currency,
        timezone: seedLocale.timezone,
      },
    });

    const permissions = [
      "property:read",
      "property:write",
      "contract:read",
      "contract:write",
      "payment:read",
      "payment:write",
      "settlement:read",
      "settlement:write",
      "finance:read",
      "finance:write",
    ];
    for (const key of permissions) {
      await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: `Allows ${key}` },
      });
    }
    const adminRole = await prisma.role.create({ data: { orgId: org.id, name: "admin" } });
    for (const key of permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.create({
        data: { roleId: adminRole.id, permissionId: permission.id },
      });
    }

    const user = await prisma.user.create({
      data: {
        email: "admin@ejemplo.co",
        passwordHash: hashPasswordPlaceholder("change-me"),
        name: "Administradora Ejemplo",
        locale: seedLocale.locale,
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, orgId: org.id, roleId: adminRole.id },
    });

    const property = await prisma.property.create({
      data: {
        orgId: org.id,
        name: "Edificio Ejemplo",
        address: "Calle 123 #45-67",
        city: "Bogotá",
        country: seedLocale.country,
        phEnabled: true,
        units: {
          create: [
            { code: "101", subtype: "RESIDENTIAL", areaM2: new Prisma.Decimal(58) },
            { code: "201", subtype: "OFFICE", areaM2: new Prisma.Decimal(42) },
            { code: "P1", subtype: "PARKING" },
          ],
        },
      },
      include: { units: true },
    });

    const ownerA = await prisma.owner.create({ data: { orgId: org.id, name: "Propietaria A" } });
    const ownerB = await prisma.owner.create({ data: { orgId: org.id, name: "Propietario B" } });
    await prisma.propertyOwnership.create({
      data: {
        propertyId: property.id,
        ownerId: ownerA.id,
        sharePct: new Prisma.Decimal(70),
        startDate: new Date("2026-01-01"),
      },
    });
    await prisma.propertyOwnership.create({
      data: {
        propertyId: property.id,
        ownerId: ownerB.id,
        sharePct: new Prisma.Decimal(30),
        startDate: new Date("2026-01-01"),
      },
    });

    const tenant = await prisma.tenant.create({
      data: { orgId: org.id, name: "Arrendataria Ejemplo" },
    });
    const unit101 = property.units.find((u) => u.code === "101");
    if (!unit101) {
      throw new Error("seed: unit 101 missing");
    }
    await prisma.tenancy.create({
      data: {
        orgId: org.id,
        propertyId: property.id,
        unitId: unit101.id,
        tenantId: tenant.id,
        startDate: new Date("2026-02-01"),
      },
    });

    const contract = await prisma.contract.create({
      data: {
        orgId: org.id,
        propertyId: property.id,
        tenantId: tenant.id,
        number: "C-2026-001",
        status: "ACTIVE",
        startDate: new Date("2026-02-01"),
        endDate: new Date("2027-01-31"),
        rentAmount: new Prisma.Decimal(1800000),
        currency: seedLocale.currency,
      },
    });

    const charge = await prisma.charge.create({
      data: {
        orgId: org.id,
        contractId: contract.id,
        type: "RENT",
        description: "Canon febrero 2026",
        amount: new Prisma.Decimal(1800000),
        currency: seedLocale.currency,
        dueDate: new Date("2026-02-05"),
        period: "2026-02",
      },
    });

    const payment = await prisma.payment.create({
      data: {
        orgId: org.id,
        contractId: contract.id,
        amount: new Prisma.Decimal(1800000),
        currency: seedLocale.currency,
        method: "TRANSFER",
        reference: "SEED-001",
        paidAt: new Date("2026-02-04"),
      },
    });
    await prisma.allocation.create({
      data: { paymentId: payment.id, chargeId: charge.id, amount: new Prisma.Decimal(1800000) },
    });
    await prisma.charge.update({ where: { id: charge.id }, data: { status: "PAID" } });

    await prisma.adminFee.create({
      data: {
        propertyId: property.id,
        type: "ORDINARY",
        amount: new Prisma.Decimal(250000),
        currency: seedLocale.currency,
        dueDate: new Date("2026-02-10"),
      },
    });

    console.log(`seed: Colombia (${seedLocale.locale}) dataset created for org "ejemplo-co"`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
