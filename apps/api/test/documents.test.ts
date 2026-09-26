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

class FakeDocumentsStore implements DocumentsStore {
  templates: {
    id: string;
    orgId: string;
    name: string;
    language: string;
    version: number;
    body: string;
  }[] = [];
  documents: {
    id: string;
    orgId: string;
    templateId: string | null;
    title: string;
    status: string;
  }[] = [];
  versions: {
    id: string;
    documentId: string;
    version: number;
    body: string;
    storageRef: string | null;
  }[] = [];
  audits: string[] = [];

  async createTemplate(orgId: string, data: { name: string; language: string; body: string }) {
    const row = { id: `tpl-${this.templates.length + 1}`, orgId, ...data, version: 1 };
    this.templates.push(row);
    const { orgId: _o, ...rest } = row;
    return rest;
  }

  async listTemplates(orgId: string) {
    return this.templates
      .filter((row) => row.orgId === orgId)
      .map(({ orgId: _o, ...rest }) => rest);
  }

  async findTemplate(id: string, orgId: string) {
    const found = this.templates.find((row) => row.id === id && row.orgId === orgId);
    if (!found) {
      return null;
    }
    const { orgId: _o, ...rest } = found;
    return rest;
  }

  async updateTemplateBody(id: string, body: string) {
    const found = this.templates.find((row) => row.id === id);
    if (!found) {
      throw new Error("Template not found.");
    }
    found.body = body;
    found.version += 1;
    const { orgId: _o, ...rest } = found;
    return rest;
  }

  async createDocument(
    orgId: string,
    data: { templateId: string | null; title: string; body: string },
  ) {
    const row = {
      id: `doc-${this.documents.length + 1}`,
      orgId,
      templateId: data.templateId,
      title: data.title,
      status: "DRAFT",
    };
    this.documents.push(row);
    this.versions.push({
      id: `ver-${this.versions.length + 1}`,
      documentId: row.id,
      version: 1,
      body: data.body,
      storageRef: null,
    });
    const { orgId: _o, ...rest } = row;
    return { ...rest, currentVersion: 1 };
  }

  async listDocuments(orgId: string, status?: string) {
    return this.documents
      .filter((row) => row.orgId === orgId && (status === undefined || row.status === status))
      .map((row) => {
        const { orgId: _o, ...rest } = row;
        return {
          ...rest,
          currentVersion: Math.max(
            0,
            ...this.versions.filter((ver) => ver.documentId === row.id).map((ver) => ver.version),
          ),
        };
      });
  }

  async findDocument(id: string, orgId: string) {
    const found = this.documents.find((row) => row.id === id && row.orgId === orgId);
    if (!found) {
      return null;
    }
    const { orgId: _o, ...rest } = found;
    return {
      ...rest,
      currentVersion: Math.max(
        0,
        ...this.versions.filter((ver) => ver.documentId === id).map((ver) => ver.version),
      ),
    };
  }

  async setDocumentStatus(id: string, status: string) {
    const found = this.documents.find((row) => row.id === id);
    if (!found) {
      throw new Error("Document not found.");
    }
    found.status = status;
    const { orgId: _o, ...rest } = found;
    return {
      ...rest,
      currentVersion: Math.max(
        0,
        ...this.versions.filter((ver) => ver.documentId === id).map((ver) => ver.version),
      ),
    };
  }

  async saveVersion(documentId: string, data: { body: string; storageRef: string | null }) {
    const version =
      Math.max(
        0,
        ...this.versions.filter((ver) => ver.documentId === documentId).map((ver) => ver.version),
      ) + 1;
    const row = { id: `ver-${this.versions.length + 1}`, documentId, version, ...data };
    this.versions.push(row);
    return row;
  }

  async listVersions(documentId: string) {
    return this.versions
      .filter((row) => row.documentId === documentId)
      .sort((a, b) => a.version - b.version);
  }

  approvals: {
    id: string;
    documentId: string;
    approverId: string;
    approved: boolean | null;
    decidedAt: Date | null;
  }[] = [];

  async recordApproval(documentId: string, approverId: string, approved: boolean) {
    const existing = this.approvals.find(
      (row) => row.documentId === documentId && row.approverId === approverId,
    );
    if (existing) {
      existing.approved = approved;
      existing.decidedAt = new Date();
      return existing;
    }
    const row = {
      id: `appr-${this.approvals.length + 1}`,
      documentId,
      approverId,
      approved,
      decidedAt: new Date(),
    };
    this.approvals.push(row);
    return row;
  }

  async listApprovals(documentId: string) {
    return this.approvals.filter((row) => row.documentId === documentId);
  }

  signatures: {
    id: string;
    documentId: string;
    signerId: string;
    signedAt: Date;
    proof: string | null;
  }[] = [];

  async recordSignature(documentId: string, signerId: string, proof: string | null) {
    const row = {
      id: `sig-${this.signatures.length + 1}`,
      documentId,
      signerId,
      signedAt: new Date(),
      proof,
    };
    this.signatures.push(row);
    return row;
  }

  async listSignatures(documentId: string) {
    return this.signatures.filter((row) => row.documentId === documentId);
  }

  pdfJobs = new Map<string, string>();

  async enqueuePdfJob(orgId: string, documentId: string, version: number) {
    void orgId;
    const key = `${documentId}:v${version}`;
    const existing = this.pdfJobs.get(key);
    if (existing) {
      return { id: existing, created: false };
    }
    const id = `pdf-${this.pdfJobs.size + 1}`;
    this.pdfJobs.set(key, id);
    return { id, created: true };
  }

  async writeAuditEvent(event: { action: string }): Promise<void> {
    this.audits.push(event.action);
  }
}

const authStore = new FakeAuthStore();
const documentsStore = new FakeDocumentsStore();

@Module({
  controllers: [AuthController, DocumentsController],
  providers: [
    AuthService,
    DocumentsService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: DOCUMENTS_STORE, useValue: documentsStore },
  ],
})
class DocumentsTestModule implements NestModule {
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
      permissions: ["document:read", "document:write", "document:approve"],
    },
  ]);
  app = await NestFactory.create(DocumentsTestModule, { logger: false });
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

describe("document templates and versioning", () => {
  test("templates carry language/version metadata and bump on update", async () => {
    const created = (await (
      await fetch(`${baseUrl}/api/v1/document-templates`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: "Contrato de arrendamiento",
          language: "es-CO",
          body: "Entre {{arrendador}} y {{arrendatario}}...",
        }),
      })
    ).json()) as { id: string; version: number; language: string };
    expect(created.version).toBe(1);
    expect(created.language).toBe("es-CO");
    const badLocale = await fetch(`${baseUrl}/api/v1/document-templates`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: "X", language: "xx", body: "Hola" }),
    });
    expect(badLocale.status).toBe(400);
    const updated = (await (
      await fetch(`${baseUrl}/api/v1/document-templates/${created.id}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ body: "Entre {{arrendador}} y {{arrendatario}} (v2)..." }),
      })
    ).json()) as { version: number };
    expect(updated.version).toBe(2);
    const listed = (await (
      await fetch(`${baseUrl}/api/v1/document-templates`, { headers: headers() })
    ).json()) as { id: string }[];
    expect(listed.map((row) => row.id)).toContain(created.id);
  });

  test("documents start from templates and every edit is a new version", async () => {
    const templates = (await (
      await fetch(`${baseUrl}/api/v1/document-templates`, { headers: headers() })
    ).json()) as { id: string }[];
    const templateId = templates[0]?.id ?? "";
    const created = (await (
      await fetch(`${baseUrl}/api/v1/documents`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ templateId, title: "Contrato C-1" }),
      })
    ).json()) as { id: string; status: string; currentVersion: number; templateId: string };
    expect(created.status).toBe("DRAFT");
    expect(created.currentVersion).toBe(1);
    expect(created.templateId).toBe(templateId);
    const edited = (await (
      await fetch(`${baseUrl}/api/v1/documents/${created.id}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ body: "Cuerpo actualizado.", storageRef: "att-1" }),
      })
    ).json()) as { version: number };
    expect(edited.version).toBe(2);
    const detail = (await (
      await fetch(`${baseUrl}/api/v1/documents/${created.id}`, { headers: headers() })
    ).json()) as { currentVersion: number; versions: { version: number }[] };
    expect(detail.currentVersion).toBe(2);
    expect(detail.versions.map((row) => row.version)).toEqual([1, 2]);
    expect(documentsStore.audits).toContain("document.edited");
  });
});
