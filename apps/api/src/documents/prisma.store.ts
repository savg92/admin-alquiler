import { prisma } from "@admin-alquiler/database";
import type {
  ApprovalRow,
  AuditInput,
  DocumentRow,
  DocumentsStore,
  DocTemplateRow,
  SignatureRow,
  VersionRow,
} from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

type PrismaDocument = NonNullable<Awaited<ReturnType<typeof prisma.document.findFirst>>>;

export class PrismaDocumentsStore implements DocumentsStore {
  async createTemplate(
    orgId: string,
    data: { name: string; language: string; body: string },
  ): Promise<DocTemplateRow> {
    const created = await prisma.documentTemplate.create({
      data: { orgId, name: data.name, language: data.language, version: 1, body: data.body },
    });
    return {
      id: created.id,
      name: created.name,
      language: created.language,
      version: created.version,
      body: created.body,
    };
  }

  async listTemplates(orgId: string): Promise<DocTemplateRow[]> {
    const rows = await prisma.documentTemplate.findMany({
      where: { orgId },
      orderBy: [{ name: "asc" }, { version: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      language: row.language,
      version: row.version,
      body: row.body,
    }));
  }

  async findTemplate(id: string, orgId: string): Promise<DocTemplateRow | null> {
    const row = await prisma.documentTemplate.findFirst({ where: { id, orgId } });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      language: row.language,
      version: row.version,
      body: row.body,
    };
  }

  async updateTemplateBody(id: string, body: string): Promise<DocTemplateRow> {
    const updated = await prisma.documentTemplate.update({
      where: { id },
      data: { body, version: { increment: 1 } },
    });
    return {
      id: updated.id,
      name: updated.name,
      language: updated.language,
      version: updated.version,
      body: updated.body,
    };
  }

  async createDocument(
    orgId: string,
    data: { templateId: string | null; title: string; body: string },
  ): Promise<DocumentRow> {
    const created = await prisma.document.create({
      data: {
        orgId,
        templateId: data.templateId,
        title: data.title,
        status: "DRAFT",
        versions: { create: { version: 1, body: data.body } },
      },
      include: { versions: { select: { version: true } } },
    });
    return {
      id: created.id,
      templateId: created.templateId,
      title: created.title,
      status: created.status,
      currentVersion: 1,
    };
  }

  async listDocuments(orgId: string, status?: string): Promise<DocumentRow[]> {
    const rows = await prisma.document.findMany({
      where: {
        orgId,
        ...(status === undefined ? {} : { status: status as PrismaDocument["status"] }),
      },
      include: { versions: { select: { version: true }, orderBy: { version: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      templateId: row.templateId,
      title: row.title,
      status: row.status,
      currentVersion: row.versions[0]?.version ?? 0,
    }));
  }

  async findDocument(id: string, orgId: string): Promise<DocumentRow | null> {
    const row = await prisma.document.findFirst({
      where: { id, orgId },
      include: { versions: { select: { version: true }, orderBy: { version: "desc" }, take: 1 } },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      templateId: row.templateId,
      title: row.title,
      status: row.status,
      currentVersion: row.versions[0]?.version ?? 0,
    };
  }

  async setDocumentStatus(id: string, status: string): Promise<DocumentRow> {
    const updated = await prisma.document.update({
      where: { id },
      data: { status: status as PrismaDocument["status"] },
      include: { versions: { select: { version: true }, orderBy: { version: "desc" }, take: 1 } },
    });
    return {
      id: updated.id,
      templateId: updated.templateId,
      title: updated.title,
      status: updated.status,
      currentVersion: updated.versions[0]?.version ?? 0,
    };
  }

  async saveVersion(
    documentId: string,
    data: { body: string; storageRef: string | null },
  ): Promise<VersionRow> {
    const last = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const created = await prisma.documentVersion.create({
      data: {
        documentId,
        version: (last?.version ?? 0) + 1,
        body: data.body,
        storageRef: data.storageRef,
      },
    });
    return {
      id: created.id,
      documentId: created.documentId,
      version: created.version,
      body: created.body,
      storageRef: created.storageRef,
    };
  }

  async listVersions(documentId: string): Promise<VersionRow[]> {
    const rows = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { version: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      version: row.version,
      body: row.body,
      storageRef: row.storageRef,
    }));
  }

  async recordApproval(
    documentId: string,
    approverId: string,
    approved: boolean,
  ): Promise<ApprovalRow> {
    const existing = await prisma.approval.findFirst({ where: { documentId, approverId } });
    const saved =
      existing !== null
        ? await prisma.approval.update({
            where: { id: existing.id },
            data: { approved, decidedAt: new Date() },
          })
        : await prisma.approval.create({
            data: { documentId, approverId, approved, decidedAt: new Date() },
          });
    return {
      id: saved.id,
      documentId: saved.documentId,
      approverId: saved.approverId,
      approved: saved.approved,
      decidedAt: saved.decidedAt,
    };
  }

  async listApprovals(documentId: string): Promise<ApprovalRow[]> {
    const rows = await prisma.approval.findMany({
      where: { documentId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      approverId: row.approverId,
      approved: row.approved,
      decidedAt: row.decidedAt,
    }));
  }

  async recordSignature(
    documentId: string,
    signerId: string,
    proof: string | null,
  ): Promise<SignatureRow> {
    const created = await prisma.signature.create({ data: { documentId, signerId, proof } });
    return {
      id: created.id,
      documentId: created.documentId,
      signerId: created.signerId,
      signedAt: created.signedAt,
      proof: created.proof,
    };
  }

  async listSignatures(documentId: string): Promise<SignatureRow[]> {
    const rows = await prisma.signature.findMany({
      where: { documentId },
      orderBy: { signedAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      signerId: row.signerId,
      signedAt: row.signedAt,
      proof: row.proof,
    }));
  }

  async enqueuePdfJob(
    orgId: string,
    documentId: string,
    version: number,
  ): Promise<{ id: string; created: boolean }> {
    const aggregateId = `${documentId}:v${version}`;
    const existing = await prisma.outboxEvent.findFirst({
      where: { orgId, aggregateType: "Document", aggregateId, type: "pdf.render" },
      select: { id: true },
    });
    if (existing) {
      return { id: existing.id, created: false };
    }
    const created = await prisma.outboxEvent.create({
      data: {
        orgId,
        aggregateType: "Document",
        aggregateId,
        type: "pdf.render",
        payload: toJsonInput({ documentId, version }),
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
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
