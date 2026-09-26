import "reflect-metadata";
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { DocumentsController } from "../src/documents/documents.controller";
import { DocumentsService } from "../src/documents/documents.service";
import type { DocumentsStore } from "../src/documents/store";
import { DOCUMENTS_STORE } from "../src/documents/tokens";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { PropertiesController } from "../src/properties/properties.controller";
import { PropertiesService } from "../src/properties/properties.service";
import type { PropertiesStore, PropertyDetail } from "../src/properties/store";
import { PROPERTIES_STORE } from "../src/properties/tokens";
import { RequestIdMiddleware } from "../src/request-id.middleware";

const TEST_SECRET = "test-secret-with-at-least-32-characters!!";

class FakeAuthStore implements AuthStore {
  users = new Map<string, UserRow>();
  sessions = new Map<string, SessionRow>();
  memberships = new Map<string, MembershipRow[]>();

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

  async writeAuditEvent(): Promise<void> {}
}

const PROP_A: PropertyDetail = {
  id: "prop-a",
  orgId: "org-a",
  name: "Edificio",
  address: "Calle 1",
  city: "Bogotá",
  country: "CO",
  phEnabled: false,
  units: [{ id: "unit-a", code: "101", subtype: "RESIDENTIAL" }],
};

class FakePropertiesStore implements PropertiesStore {
  attachments: {
    id: string;
    orgId: string;
    propertyId: string;
    unitId: string | null;
    kind: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    capturedAt: string | null;
    createdBy: string;
  }[] = [];

  async findOrgDefaults() {
    return { country: "CO", locale: "es-CO", currency: "COP" };
  }

  async createProperty(): Promise<PropertyDetail> {
    throw new Error("not implemented");
  }

  async listProperties() {
    return [];
  }

  async findProperty(id: string, orgId: string): Promise<PropertyDetail | null> {
    return id === PROP_A.id && orgId === PROP_A.orgId ? PROP_A : null;
  }

  async unitTenancyPeriods() {
    return [];
  }

  async ownershipTotalPct() {
    return 0;
  }

  async tenancyCount() {
    return 0;
  }

  async createOwner() {
    return { id: "owner-1" };
  }

  async assignOwnership(): Promise<void> {}

  async createTenant() {
    return { id: "tenant-1" };
  }

  async updatePropertyConfig() {
    return null;
  }

  async updateUnitConfig() {
    return null;
  }

  async listAttachments(propertyId: string, orgId: string) {
    if (propertyId !== PROP_A.id || orgId !== PROP_A.orgId) {
      return null;
    }
    return this.attachments
      .filter((row) => row.propertyId === propertyId)
      .map((row) => ({
        id: row.id,
        propertyId: row.propertyId,
        unitId: row.unitId,
        kind: row.kind,
        storageKey: row.storageKey,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        capturedAt: row.capturedAt,
        createdBy: row.createdBy,
      }));
  }

  async createAttachment(data: {
    orgId: string;
    propertyId: string;
    unitId: string | null;
    kind: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    capturedAt: Date | null;
    createdBy: string;
  }) {
    const row = {
      id: `att-${this.attachments.length + 1}`,
      ...data,
      capturedAt: data.capturedAt?.toISOString() ?? null,
    };
    this.attachments.push(row);
    return {
      id: row.id,
      propertyId: row.propertyId,
      unitId: row.unitId,
      kind: row.kind,
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      capturedAt: row.capturedAt,
      createdBy: row.createdBy,
    };
  }

  async deleteAttachment() {
    return false;
  }

  async createTenancy() {
    return { id: "tenancy-1" };
  }

  async writeAuditEvent(): Promise<void> {}
}

class FakeDocumentsStore implements DocumentsStore {
  documents: {
    id: string;
    orgId: string;
    templateId: string | null;
    title: string;
    status: string;
  }[] = [{ id: "doc-a", orgId: "org-a", templateId: null, title: "Acta", status: "DRAFT" }];

  async createTemplate(): Promise<never> {
    throw new Error("not implemented");
  }

  async listTemplates() {
    return [];
  }

  async findTemplate() {
    return null;
  }

  async updateTemplateBody(): Promise<never> {
    throw new Error("not implemented");
  }

  async createDocument(
    _orgId: string,
    _data: { templateId: string | null; title: string; body: string },
  ): Promise<never> {
    throw new Error("not implemented");
  }

  async listDocuments() {
    return [];
  }

  async findDocument(id: string, orgId: string) {
    const found = this.documents.find((row) => row.id === id && row.orgId === orgId);
    if (!found) {
      return null;
    }
    const { orgId: _o, ...rest } = found;
    return { ...rest, currentVersion: 1 };
  }

  async setDocumentStatus(): Promise<never> {
    throw new Error("not implemented");
  }

  async saveVersion(): Promise<never> {
    throw new Error("not implemented");
  }

  async listVersions() {
    return [];
  }

  async recordApproval(): Promise<never> {
    throw new Error("not implemented");
  }

  async listApprovals() {
    return [];
  }

  async recordSignature(): Promise<never> {
    throw new Error("not implemented");
  }

  async listSignatures() {
    return [];
  }

  async enqueuePdfJob() {
    return { id: "pdf-1", created: true };
  }

  async writeAuditEvent(): Promise<void> {}
}

const authStore = new FakeAuthStore();

@Module({
  controllers: [AuthController, PropertiesController, DocumentsController],
  providers: [
    AuthService,
    PropertiesService,
    DocumentsService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: PROPERTIES_STORE, useValue: new FakePropertiesStore() },
    { provide: DOCUMENTS_STORE, useValue: new FakeDocumentsStore() },
  ],
})
class AbuseTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}

let app: INestApplication;
let baseUrl: string;

function loginBody(email: string, password: string) {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function tokenFor(email: string, password: string): Promise<string> {
  const response = await loginBody(email, password);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

function headers(token: string, org = "org-a"): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "X-Org-Id": org, "Content-Type": "application/json" };
}

beforeAll(async () => {
  authStore.users.set("admin", {
    id: "admin",
    email: "admin@ejemplo.co",
    passwordHash: hashPassword("correct-horse-1"),
    name: "Admin",
  });
  authStore.memberships.set("admin", [
    {
      orgId: "org-a",
      status: "ACTIVE",
      roleName: "admin",
      permissions: ["property:read", "property:write", "document:read", "document:write"],
    },
  ]);
  authStore.users.set("reader", {
    id: "reader",
    email: "reader@ejemplo.co",
    passwordHash: hashPassword("correct-horse-2"),
    name: "Reader",
  });
  authStore.memberships.set("reader", [
    { orgId: "org-a", status: "ACTIVE", roleName: "viewer", permissions: ["property:read"] },
  ]);
  authStore.users.set("outsider", {
    id: "outsider",
    email: "outsider@ejemplo.co",
    passwordHash: hashPassword("correct-horse-3"),
    name: "Outsider",
  });
  authStore.memberships.set("outsider", [
    {
      orgId: "org-b",
      status: "ACTIVE",
      roleName: "admin",
      permissions: ["property:read", "property:write", "document:read"],
    },
  ]);
  app = await NestFactory.create(AbuseTestModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe("auth abuse", () => {
  test("wrong credentials fail and sessions never ride on cookies", async () => {
    expect((await loginBody("admin@ejemplo.co", "wrong")).status).toBe(401);
    expect((await loginBody("nobody@ejemplo.co", "wrong")).status).toBe(401);
    const ok = await loginBody("admin@ejemplo.co", "correct-horse-1");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toBeNull();
  });

  test("tampered tokens are rejected without org leakage", async () => {
    const token = await tokenFor("admin@ejemplo.co", "correct-horse-1");
    const forged = `${token.slice(0, -2)}xx`;
    const response = await fetch(`${baseUrl}/api/v1/properties/${PROP_A.id}/attachments`, {
      headers: { Authorization: `Bearer ${forged}`, "X-Org-Id": "org-a" },
    });
    expect(response.status).toBe(403);
  });
});

describe("upload abuse", () => {
  test("oversize, MIME and path traversal are rejected", async () => {
    const token = await tokenFor("admin@ejemplo.co", "correct-horse-1");
    const post = (body: Record<string, unknown>) =>
      fetch(`${baseUrl}/api/v1/properties/${PROP_A.id}/attachments`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(body),
      });
    const base = {
      kind: "PHOTO",
      storageKey: "uploads/a.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100,
    };
    expect((await post({ ...base, sizeBytes: 11 * 1024 * 1024 })).status).toBe(400);
    expect((await post({ ...base, mimeType: "application/x-sh" })).status).toBe(400);
    expect((await post({ ...base, storageKey: "../../etc/passwd" })).status).toBe(400);
    expect((await post({ ...base, storageKey: "uploads/ok.jpg" })).status).toBe(201);
  });

  test("anonymous and under-privileged uploads fail", async () => {
    const anonymous = await fetch(`${baseUrl}/api/v1/properties/${PROP_A.id}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "PHOTO",
        storageKey: "a.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
      }),
    });
    expect(anonymous.status).toBe(403);
    const readerToken = await tokenFor("reader@ejemplo.co", "correct-horse-2");
    const escalated = await fetch(`${baseUrl}/api/v1/properties/${PROP_A.id}/attachments`, {
      method: "POST",
      headers: headers(readerToken),
      body: JSON.stringify({
        kind: "PHOTO",
        storageKey: "a.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
      }),
    });
    expect(escalated.status).toBe(403);
  });
});

describe("tenant isolation", () => {
  test("cross-org reads see nothing, never another org's rows", async () => {
    const outsiderToken = await tokenFor("outsider@ejemplo.co", "correct-horse-3");
    const attachments = await fetch(`${baseUrl}/api/v1/properties/${PROP_A.id}/attachments`, {
      headers: headers(outsiderToken, "org-b"),
    });
    expect(attachments.status).toBe(404);
    const document = await fetch(`${baseUrl}/api/v1/documents/doc-a`, {
      headers: headers(outsiderToken, "org-b"),
    });
    expect(document.status).toBe(404);
  });

  test("read-only roles cannot create documents", async () => {
    const readerToken = await tokenFor("reader@ejemplo.co", "correct-horse-2");
    const created = await fetch(`${baseUrl}/api/v1/documents`, {
      method: "POST",
      headers: headers(readerToken),
      body: JSON.stringify({ title: "X", body: "Y" }),
    });
    expect(created.status).toBe(403);
  });
});
