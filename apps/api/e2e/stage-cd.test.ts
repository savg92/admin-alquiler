import "reflect-metadata";
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import { AuditController } from "../src/audit/audit.controller";
import { AuditService } from "../src/audit/audit.service";
import type { AuditStore } from "../src/audit/store";
import { AUDIT_STORE } from "../src/audit/tokens";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { CommunicationsController } from "../src/communications/communications.controller";
import { CommunicationsService } from "../src/communications/communications.service";
import type { CommunicationsStore } from "../src/communications/store";
import { COMMUNICATIONS_STORE } from "../src/communications/tokens";
import { DocumentsController } from "../src/documents/documents.controller";
import { DocumentsService } from "../src/documents/documents.service";
import type { DocumentsStore } from "../src/documents/store";
import { DOCUMENTS_STORE } from "../src/documents/tokens";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { MaintenanceController } from "../src/operations/maintenance.controller";
import { MaintenanceService } from "../src/operations/maintenance.service";
import type { OperationsStore } from "../src/operations/store";
import { OPERATIONS_STORE } from "../src/operations/tokens";
import { RequestIdMiddleware } from "../src/request-id.middleware";

const TEST_SECRET = "test-secret-with-at-least-32-characters!!";
const PERMISSIONS = [
  "document:read",
  "document:write",
  "document:approve",
  "maintenance:read",
  "maintenance:write",
  "communication:read",
  "communication:write",
  "report:read",
];

interface AuditEntry {
  orgId: string;
  action: string;
  entityType?: string;
  entityId?: string;
}

const auditLog: (AuditEntry & { createdAt: Date })[] = [];

function recordAudit(event: AuditEntry): void {
  auditLog.push({ ...event, createdAt: new Date() });
}

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

  async writeAuditEvent(event: AuditEntry): Promise<void> {
    recordAudit({ ...event, orgId: event.orgId ?? "" });
  }
}

class FakeDocumentsStore implements DocumentsStore {
  documents: { id: string; orgId: string; title: string; status: string }[] = [];
  approvals: { documentId: string; approved: boolean }[] = [];
  pdfJobs = new Set<string>();

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
    orgId: string,
    data: { templateId: string | null; title: string; body: string },
  ) {
    void data;
    const row = {
      id: `doc-${this.documents.length + 1}`,
      orgId,
      templateId: null,
      title: data.title,
      status: "DRAFT",
    };
    this.documents.push(row);
    const { orgId: _o, ...rest } = row;
    return { ...rest, currentVersion: 1 };
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
    return { templateId: null, ...rest, currentVersion: 1 };
  }

  async setDocumentStatus(id: string, status: string) {
    const found = this.documents.find((row) => row.id === id);
    if (!found) {
      throw new Error("Document not found.");
    }
    found.status = status;
    const { orgId: _o, ...rest } = found;
    return { templateId: null, ...rest, currentVersion: 1 };
  }

  async saveVersion(): Promise<never> {
    throw new Error("not implemented");
  }

  async listVersions() {
    return [];
  }

  async recordApproval(documentId: string, approverId: string, approved: boolean) {
    void approverId;
    const row = {
      id: `appr-${documentId}`,
      documentId,
      approverId,
      approved,
      decidedAt: new Date(),
    };
    this.approvals.push({ documentId, approved });
    return row;
  }

  async listApprovals(documentId: string) {
    return this.approvals
      .filter((row) => row.documentId === documentId)
      .map((row, index) => ({
        id: `appr-${index}`,
        documentId: row.documentId,
        approverId: "user-1",
        approved: row.approved,
        decidedAt: new Date(),
      }));
  }

  async recordSignature(): Promise<never> {
    throw new Error("not implemented");
  }

  async listSignatures() {
    return [];
  }

  async enqueuePdfJob(_orgId: string, documentId: string, version: number) {
    const key = `${documentId}:v${version}`;
    if (this.pdfJobs.has(key)) {
      return { id: `pdf-${key}`, created: false };
    }
    this.pdfJobs.add(key);
    return { id: `pdf-${key}`, created: true };
  }

  async writeAuditEvent(event: AuditEntry): Promise<void> {
    recordAudit(event as AuditEntry & { orgId: string });
  }
}

class FakeOperationsStore implements OperationsStore {
  requests: { id: string; orgId: string; title: string; status: string }[] = [];

  async findProperty(id: string, orgId: string) {
    return id === "prop-1" && orgId === "org-a" ? { id } : null;
  }

  async findUnit() {
    return null;
  }

  async createMaintenanceRequest(
    orgId: string,
    data: {
      propertyId: string;
      unitId: string | null;
      title: string;
      description: string;
      priority: string;
    },
  ) {
    void data;
    const row = { id: `mr-${this.requests.length + 1}`, orgId, title: data.title, status: "OPEN" };
    this.requests.push(row);
    return {
      id: row.id,
      propertyId: data.propertyId,
      unitId: null,
      title: row.title,
      description: data.description,
      priority: data.priority,
      status: row.status,
    };
  }

  async listMaintenanceRequests() {
    return [];
  }

  async findMaintenanceRequest() {
    return null;
  }

  async setMaintenanceStatus(): Promise<never> {
    throw new Error("not implemented");
  }

  async createWorkOrder(): Promise<never> {
    throw new Error("not implemented");
  }

  async listWorkOrders() {
    return [];
  }

  async setWorkOrderStatus(): Promise<never> {
    throw new Error("not implemented");
  }

  async assignWorkOrderSupplier(): Promise<never> {
    throw new Error("not implemented");
  }

  async createSupplier(): Promise<never> {
    throw new Error("not implemented");
  }

  async listSuppliers() {
    return [];
  }

  async findSupplier() {
    return null;
  }

  async createPurchase(): Promise<never> {
    throw new Error("not implemented");
  }

  async listPurchases() {
    return [];
  }

  async createInsurance(): Promise<never> {
    throw new Error("not implemented");
  }

  async listInsurance() {
    return [];
  }

  async createComplaint(): Promise<never> {
    throw new Error("not implemented");
  }

  async listComplaints() {
    return [];
  }

  async findComplaint() {
    return null;
  }

  async setComplaintStatus(): Promise<never> {
    throw new Error("not implemented");
  }

  async createClaim(): Promise<never> {
    throw new Error("not implemented");
  }

  async listClaims() {
    return [];
  }

  async findClaim() {
    return null;
  }

  async setClaimStatus(): Promise<never> {
    throw new Error("not implemented");
  }

  async createTaxRecord(): Promise<never> {
    throw new Error("not implemented");
  }

  async listTaxRecords() {
    return [];
  }

  async createHouseRule(): Promise<never> {
    throw new Error("not implemented");
  }

  async listHouseRules() {
    return [];
  }

  async createHandover(): Promise<never> {
    throw new Error("not implemented");
  }

  async listHandovers() {
    return [];
  }

  async findHandover() {
    return null;
  }

  async writeAuditEvent(event: AuditEntry): Promise<void> {
    recordAudit(event as AuditEntry & { orgId: string });
  }
}

class FakeCommunicationsStore implements CommunicationsStore {
  async createNotification(
    _orgId: string,
    data: { userId: string | null; channel: "IN_APP" | "EMAIL"; title: string; body: string },
  ) {
    return { id: "notif-1", ...data, readAt: null, createdAt: new Date() };
  }

  async listNotifications() {
    return [];
  }

  async markNotificationRead(): Promise<never> {
    throw new Error("not implemented");
  }

  async getPreferences() {
    return [];
  }

  async setPreference(
    _orgId: string,
    userId: string,
    channel: "IN_APP" | "EMAIL",
    enabled: boolean,
  ) {
    return { userId, channel, enabled };
  }

  async isChannelEnabled() {
    return true;
  }

  async createCommunication(): Promise<never> {
    throw new Error("not implemented");
  }

  async listCommunications() {
    return [];
  }

  async upsertTemplate(): Promise<never> {
    throw new Error("not implemented");
  }

  async findTemplate() {
    return null;
  }

  async listTemplates() {
    return [];
  }

  async enqueueOutbox(): Promise<never> {
    throw new Error("not implemented");
  }

  async pendingOutbox() {
    return [];
  }

  async markOutboxProcessed(): Promise<void> {}

  async writeAuditEvent(event: AuditEntry): Promise<void> {
    recordAudit(event as AuditEntry & { orgId: string });
  }
}

class FakeAuditStore implements AuditStore {
  async listAuditEvents(
    orgId: string,
    filter: { entityType?: string; entityId?: string; action?: string; limit?: number },
  ) {
    return auditLog
      .filter(
        (row) =>
          row.orgId === orgId &&
          (filter.entityType === undefined || row.entityType === filter.entityType) &&
          (filter.entityId === undefined || row.entityId === filter.entityId) &&
          (filter.action === undefined || row.action === filter.action),
      )
      .slice(-(filter.limit ?? 100))
      .map((row, index) => ({
        id: `audit-${index}`,
        action: row.action,
        entityType: row.entityType ?? null,
        entityId: row.entityId ?? null,
        actorId: "user-1",
        createdAt: row.createdAt,
      }));
  }
}

const authStore = new FakeAuthStore();

@Module({
  controllers: [
    AuthController,
    DocumentsController,
    MaintenanceController,
    CommunicationsController,
    AuditController,
  ],
  providers: [
    AuthService,
    DocumentsService,
    MaintenanceService,
    CommunicationsService,
    AuditService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: DOCUMENTS_STORE, useValue: new FakeDocumentsStore() },
    { provide: OPERATIONS_STORE, useValue: new FakeOperationsStore() },
    { provide: COMMUNICATIONS_STORE, useValue: new FakeCommunicationsStore() },
    { provide: AUDIT_STORE, useValue: new FakeAuditStore() },
  ],
})
class StageCDTestModule implements NestModule {
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
    { orgId: "org-a", status: "ACTIVE", roleName: "admin", permissions: [...PERMISSIONS] },
  ]);
  authStore.users.set("outsider", {
    id: "outsider",
    email: "outsider@ejemplo.co",
    passwordHash: hashPassword("correct-horse-2"),
    name: "Outsider",
  });
  authStore.memberships.set("outsider", [
    {
      orgId: "org-b",
      status: "ACTIVE",
      roleName: "admin",
      permissions: [...PERMISSIONS],
    },
  ]);
  app = await NestFactory.create(StageCDTestModule, { logger: false });
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

describe("Stage C/D E2E gate (steps 11-16)", () => {
  test("approve document, generate PDF, request maintenance, notify", async () => {
    const created = (await (
      await fetch(`${baseUrl}/api/v1/documents`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title: "Acta E2E", body: "Contenido." }),
      })
    ).json()) as { id: string };
    expect(created.id).toBeDefined();

    for (const to of ["IN_REVIEW"]) {
      expect(
        (
          await fetch(`${baseUrl}/api/v1/documents/${created.id}/transitions`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ to }),
          })
        ).status,
      ).toBe(201);
    }
    expect(
      (
        await fetch(`${baseUrl}/api/v1/documents/${created.id}/approvals`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ approved: true }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fetch(`${baseUrl}/api/v1/documents/${created.id}/transitions`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ to: "APPROVED" }),
        })
      ).status,
    ).toBe(201);

    const pdf = (await (
      await fetch(`${baseUrl}/api/v1/documents/${created.id}/pdf`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({}),
      })
    ).json()) as { created: boolean };
    expect(pdf.created).toBe(true);

    const request = await fetch(`${baseUrl}/api/v1/maintenance-requests`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        propertyId: "prop-1",
        title: "Fuga E2E",
        description: "Goteo.",
      }),
    });
    expect(request.status).toBe(201);

    const notification = await fetch(`${baseUrl}/api/v1/notifications`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        userId: "user-1",
        channel: "IN_APP",
        title: "E2E",
        body: "Flujo completo.",
      }),
    });
    expect(notification.status).toBe(201);
  });

  test("audit trail records every step", async () => {
    const trail = (await (
      await fetch(`${baseUrl}/api/v1/audit-events?action=document.created`, { headers: headers() })
    ).json()) as { action: string }[];
    expect(trail.length).toBeGreaterThan(0);
    expect(trail.every((row) => row.action === "document.created")).toBe(true);
    const maintenance = (await (
      await fetch(`${baseUrl}/api/v1/audit-events?action=maintenance.request_created`, {
        headers: headers(),
      })
    ).json()) as { action: string }[];
    expect(maintenance).toHaveLength(1);
    const notified = (await (
      await fetch(`${baseUrl}/api/v1/audit-events?action=notification.sent`, { headers: headers() })
    ).json()) as { action: string }[];
    expect(notified).toHaveLength(1);
  });

  test("tenant isolation holds on new modules", async () => {
    const outsiderLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "outsider@ejemplo.co", password: "correct-horse-2" }),
    });
    const outsiderToken = ((await outsiderLogin.json()) as { accessToken: string }).accessToken;
    const outsiderHeaders = {
      Authorization: `Bearer ${outsiderToken}`,
      "X-Org-Id": "org-b",
      "Content-Type": "application/json",
    };
    const crossOrg = await fetch(`${baseUrl}/api/v1/documents/doc-1`, {
      headers: outsiderHeaders,
    });
    expect(crossOrg.status).toBe(404);
    const crossAudit = (await (
      await fetch(`${baseUrl}/api/v1/audit-events`, { headers: outsiderHeaders })
    ).json()) as unknown[];
    expect(crossAudit).toEqual([]);
    const anonymous = await fetch(`${baseUrl}/api/v1/maintenance-requests`);
    expect(anonymous.status).toBe(403);
  });
});
