import "reflect-metadata";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import type { TenancyPeriod } from "@admin-alquiler/domain";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { RequestIdMiddleware } from "../src/request-id.middleware";
import { PropertiesController } from "../src/properties/properties.controller";
import { PropertiesService } from "../src/properties/properties.service";
import type {
  CreatePropertyInput,
  PropertiesStore,
  PropertyDetail,
  PropertyRow,
} from "../src/properties/store";
import { PROPERTIES_STORE } from "../src/properties/tokens";

const TEST_SECRET = "test-secret-with-at-least-32-characters!!";

class FakeAuthStore implements AuthStore {
  users = new Map<string, UserRow>();
  sessions = new Map<string, SessionRow>();
  memberships = new Map<string, MembershipRow[]>();
  audits: string[] = [];

  async findUserByEmail(email: string): Promise<UserRow | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    return this.users.get(id) ?? null;
  }

  async createSession(data: { userId: string; expiresAt: Date }): Promise<{ id: string }> {
    const id = `session-${this.sessions.size + 1}`;
    this.sessions.set(id, { id, userId: data.userId, expiresAt: data.expiresAt, rotatedAt: null });
    return { id };
  }

  async findSessionById(id: string): Promise<SessionRow | null> {
    return this.sessions.get(id) ?? null;
  }

  async touchSession(): Promise<void> {}

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async listMemberships(userId: string): Promise<MembershipRow[]> {
    return this.memberships.get(userId) ?? [];
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

interface StoredProperty extends PropertyDetail {
  tenancies: { unitId: string | null; startDate: string; endDate: string | null }[];
  shares: number[];
}

class FakePropertiesStore implements PropertiesStore {
  properties = new Map<string, StoredProperty>();
  audits: string[] = [];

  async findOrgDefaults(): Promise<{ country: string; locale: string; currency: string }> {
    return { country: "CO", locale: "es-CO", currency: "COP" };
  }

  async createProperty(orgId: string, input: CreatePropertyInput): Promise<PropertyDetail> {
    const id = `prop-${this.properties.size + 1}`;
    const detail: StoredProperty = {
      id,
      orgId,
      name: input.name,
      address: input.address,
      city: input.city,
      country: "CO",
      phEnabled: input.phEnabled,
      units: input.units.map((unit, index) => ({
        id: `unit-${id}-${index + 1}`,
        code: unit.code.trim(),
        subtype: unit.subtype,
      })),
      tenancies: [],
      shares: [],
    };
    this.properties.set(id, detail);
    const { tenancies: _t, shares: _s, ...rest } = detail;
    return rest;
  }

  async listProperties(orgId: string): Promise<PropertyRow[]> {
    return [...this.properties.values()]
      .filter((property) => property.orgId === orgId)
      .map(({ tenancies: _t, shares: _s, units: _u, ...row }) => row);
  }

  async findProperty(id: string, orgId: string): Promise<PropertyDetail | null> {
    const found = this.properties.get(id);
    if (!found || found.orgId !== orgId) {
      return null;
    }
    const { tenancies: _t, shares: _s, ...rest } = found;
    return rest;
  }

  async unitTenancyPeriods(unitId: string): Promise<TenancyPeriod[]> {
    const periods: TenancyPeriod[] = [];
    for (const property of this.properties.values()) {
      for (const tenancy of property.tenancies) {
        if (tenancy.unitId === unitId) {
          periods.push({ startDate: tenancy.startDate, endDate: tenancy.endDate });
        }
      }
    }
    return periods;
  }

  async ownershipTotalPct(propertyId: string): Promise<number> {
    const found = this.properties.get(propertyId);
    return found ? found.shares.reduce((total, share) => total + share, 0) : 0;
  }

  async tenancyCount(propertyId: string): Promise<number> {
    return this.properties.get(propertyId)?.tenancies.length ?? 0;
  }

  async createOwner(): Promise<{ id: string }> {
    return { id: `owner-${Date.now()}` };
  }

  async assignOwnership(data: { propertyId: string; sharePct: number }): Promise<void> {
    this.properties.get(data.propertyId)?.shares.push(data.sharePct);
  }

  async createTenant(): Promise<{ id: string }> {
    return { id: `tenant-${Date.now()}` };
  }

  async createTenancy(data: {
    propertyId: string;
    unitId: string | null;
    startDate: Date;
    endDate: Date | null;
  }): Promise<{ id: string }> {
    this.properties.get(data.propertyId)?.tenancies.push({
      unitId: data.unitId,
      startDate: data.startDate.toISOString().slice(0, 10),
      endDate: data.endDate ? data.endDate.toISOString().slice(0, 10) : null,
    });
    return { id: `tenancy-${Date.now()}` };
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const authStore = new FakeAuthStore();
const propertiesStore = new FakePropertiesStore();

@Module({
  controllers: [AuthController, PropertiesController],
  providers: [
    AuthService,
    PropertiesService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: PROPERTIES_STORE, useValue: propertiesStore },
  ],
})
class PropertiesTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}

let app: INestApplication;
let baseUrl: string;
let token = "";

function headers(org = "org-a"): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "X-Org-Id": org, "Content-Type": "application/json" };
}

beforeAll(async () => {
  authStore.users.set("user-1", {
    id: "user-1",
    email: "admin@ejemplo.co",
    passwordHash: hashPassword("correct-horse-1"),
    name: "Admin",
  });
  authStore.memberships.set("user-1", [
    {
      orgId: "org-a",
      status: "ACTIVE",
      roleName: "admin",
      permissions: ["property:read", "property:write"],
    },
  ]);
  app = await NestFactory.create(PropertiesTestModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@ejemplo.co", password: "correct-horse-1" }),
  });
  token = ((await login.json()) as { accessToken: string }).accessToken;
});

afterAll(async () => {
  await app?.close();
});

describe("properties and people", () => {
  test("creates a property with bulk units", async () => {
    const response = await fetch(`${baseUrl}/api/v1/properties`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: "Edificio Test",
        address: "Calle 1 #2-3",
        city: "Bogotá",
        phEnabled: true,
        units: [
          { code: "101", subtype: "RESIDENTIAL" },
          { code: "P1", subtype: "PARKING" },
        ],
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; units: { code: string }[] };
    expect(body.units.map((unit) => unit.code).sort()).toEqual(["101", "P1"]);
    expect(propertiesStore.audits).toContain("property.created");
  });

  test("rejects duplicate unit codes", async () => {
    const response = await fetch(`${baseUrl}/api/v1/properties`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: "Duplicado",
        address: "Calle 1",
        city: "Bogotá",
        phEnabled: false,
        units: [
          { code: "101", subtype: "RESIDENTIAL" },
          { code: "101", subtype: "OFFICE" },
        ],
      }),
    });
    expect(response.status).toBe(400);
  });

  test("organization isolation: other orgs see nothing", async () => {
    const response = await fetch(`${baseUrl}/api/v1/properties`, { headers: headers("org-b") });
    expect(response.status).toBe(403);
    const own = (await (
      await fetch(`${baseUrl}/api/v1/properties`, { headers: headers() })
    ).json()) as { id: string }[];
    expect(own.length).toBeGreaterThan(0);
  });

  test("setup checklist tracks progress and owners respect the 100% cap", async () => {
    const properties = (await (
      await fetch(`${baseUrl}/api/v1/properties`, { headers: headers() })
    ).json()) as { id: string }[];
    const propertyId = properties[0]?.id ?? "";
    const setup = (await (
      await fetch(`${baseUrl}/api/v1/properties/${propertyId}/setup`, { headers: headers() })
    ).json()) as { units: boolean; owners: boolean; complete: boolean };
    expect(setup.units).toBe(true);
    expect(setup.owners).toBe(false);
    expect(setup.complete).toBe(false);

    const addOwner = (sharePct: number) =>
      fetch(`${baseUrl}/api/v1/owners`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ propertyId, name: "Owner", sharePct, startDate: "2026-01-01" }),
      });
    expect((await addOwner(70)).status).toBe(201);
    expect((await addOwner(40)).status).toBe(400);
    expect((await addOwner(30)).status).toBe(201);
  });

  test("overlapping tenancies on the same unit are rejected", async () => {
    const properties = (await (
      await fetch(`${baseUrl}/api/v1/properties`, { headers: headers() })
    ).json()) as { id: string }[];
    const detail = (await (
      await fetch(`${baseUrl}/api/v1/properties/${properties[0]?.id}`, { headers: headers() })
    ).json()) as { units: { id: string }[] };
    const unitId = detail.units[0]?.id ?? "";
    const addTenant = (name: string, startDate: string) =>
      fetch(`${baseUrl}/api/v1/tenants`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ propertyId: properties[0]?.id, unitId, name, startDate }),
      });
    expect((await addTenant("Tenant A", "2026-02-01")).status).toBe(201);
    expect((await addTenant("Tenant B", "2026-06-01")).status).toBe(400);
  });

  test("unauthenticated requests are rejected", async () => {
    const response = await fetch(`${baseUrl}/api/v1/properties`);
    expect(response.status).toBe(403);
  });
});
