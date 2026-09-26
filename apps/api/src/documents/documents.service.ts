import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  canTransitionDocument,
  validateDocumentBody,
  validateDocumentTitle,
  validateLocale,
  validateTemplateName,
  type DocumentStatus,
} from "@admin-alquiler/domain";
import { DOCUMENTS_STORE } from "./tokens";
import type { DocumentsStore } from "./store";

@Injectable()
export class DocumentsService {
  constructor(@Inject(DOCUMENTS_STORE) private readonly store: DocumentsStore) {}

  async createTemplate(
    orgId: string,
    actorId: string,
    name: string,
    language: string,
    body: string,
  ) {
    let cleanName: string;
    let cleanBody: string;
    try {
      cleanName = validateTemplateName(name);
      cleanBody = validateDocumentBody(body);
      validateLocale(language);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid template.");
    }
    const created = await this.store.createTemplate(orgId, {
      name: cleanName,
      language,
      body: cleanBody,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "document_template.created",
        entityType: "DocumentTemplate",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listTemplates(orgId: string) {
    return this.store.listTemplates(orgId);
  }

  async updateTemplate(orgId: string, actorId: string, id: string, body: string) {
    const found = await this.store.findTemplate(id, orgId);
    if (!found) {
      throw new NotFoundException("Template not found.");
    }
    let cleanBody: string;
    try {
      cleanBody = validateDocumentBody(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid body.");
    }
    const updated = await this.store.updateTemplateBody(id, cleanBody);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "document_template.updated",
        entityType: "DocumentTemplate",
        entityId: id,
        metadata: { version: updated.version },
      }),
    );
    return updated;
  }

  async createDocument(
    orgId: string,
    actorId: string,
    input: { templateId?: string; title: string; body?: string },
  ) {
    let title: string;
    try {
      title = validateDocumentTitle(input.title);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid document.");
    }
    let templateId: string | null = null;
    let body = input.body;
    if (input.templateId !== undefined) {
      const template = await this.store.findTemplate(input.templateId, orgId);
      if (!template) {
        throw new NotFoundException("Template not found.");
      }
      templateId = template.id;
      body = body ?? template.body;
    }
    if (body === undefined) {
      throw new BadRequestException("body or templateId is required.");
    }
    let cleanBody: string;
    try {
      cleanBody = validateDocumentBody(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid body.");
    }
    const created = await this.store.createDocument(orgId, { templateId, title, body: cleanBody });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "document.created",
        entityType: "Document",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listDocuments(orgId: string, status?: string) {
    if (status !== undefined) {
      const valid = ["DRAFT", "IN_REVIEW", "APPROVED", "SIGNED", "FINAL", "ARCHIVED"];
      if (!valid.includes(status)) {
        throw new BadRequestException(`Invalid status "${status}".`);
      }
    }
    return this.store.listDocuments(orgId, ...(status === undefined ? [] : [status]));
  }

  async getDocument(id: string, orgId: string) {
    const found = await this.store.findDocument(id, orgId);
    if (!found) {
      throw new NotFoundException("Document not found.");
    }
    const versions = await this.store.listVersions(id);
    return { ...found, versions };
  }

  async editDocument(
    orgId: string,
    actorId: string,
    id: string,
    body: string,
    storageRef?: string | null,
  ) {
    const found = await this.store.findDocument(id, orgId);
    if (!found) {
      throw new NotFoundException("Document not found.");
    }
    if (found.status !== "DRAFT" && found.status !== "IN_REVIEW") {
      throw new BadRequestException("Only draft or in-review documents can be edited.");
    }
    let cleanBody: string;
    try {
      cleanBody = validateDocumentBody(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid body.");
    }
    const saved = await this.store.saveVersion(id, {
      body: cleanBody,
      storageRef: storageRef ?? null,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "document.edited",
        entityType: "Document",
        entityId: id,
        metadata: { version: saved.version },
      }),
    );
    return saved;
  }

  async transitionDocument(orgId: string, actorId: string, id: string, to: DocumentStatus) {
    const valid = ["DRAFT", "IN_REVIEW", "APPROVED", "SIGNED", "FINAL", "ARCHIVED"];
    if (!valid.includes(to)) {
      throw new BadRequestException(`Invalid status "${to}".`);
    }
    const found = await this.store.findDocument(id, orgId);
    if (!found) {
      throw new NotFoundException("Document not found.");
    }
    const from = found.status as DocumentStatus;
    if (!canTransitionDocument(from, to)) {
      throw new BadRequestException(`Cannot transition from ${from} to ${to}.`);
    }
    if (to === "APPROVED") {
      const approvals = await this.store.listApprovals(id);
      const approved = approvals.filter((row) => row.approved === true).length;
      const rejected = approvals.filter((row) => row.approved === false).length;
      if (approved === 0 || rejected > 0) {
        throw new BadRequestException("Approval requires an approval with no rejections.");
      }
    }
    if (to === "SIGNED") {
      const signatures = await this.store.listSignatures(id);
      if (signatures.length === 0) {
        throw new BadRequestException("Signing requires at least one recorded signature.");
      }
    }
    const updated = await this.store.setDocumentStatus(id, to);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "document.status_changed",
        entityType: "Document",
        entityId: id,
        metadata: { from, to },
      }),
    );
    return updated;
  }

  async recordApproval(orgId: string, actorId: string, id: string, approved: boolean) {
    const found = await this.store.findDocument(id, orgId);
    if (!found) {
      throw new NotFoundException("Document not found.");
    }
    if (found.status !== "IN_REVIEW") {
      throw new BadRequestException("Approvals are only recorded while in review.");
    }
    const saved = await this.store.recordApproval(id, actorId, approved);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: approved ? "document.approved" : "document.rejected",
        entityType: "Approval",
        entityId: saved.id,
        metadata: { documentId: id },
      }),
    );
    return saved;
  }

  async listApprovals(id: string, orgId: string) {
    const found = await this.store.findDocument(id, orgId);
    if (!found) {
      throw new NotFoundException("Document not found.");
    }
    return this.store.listApprovals(id);
  }

  async recordSignature(orgId: string, actorId: string, id: string, proof?: string | null) {
    const found = await this.store.findDocument(id, orgId);
    if (!found) {
      throw new NotFoundException("Document not found.");
    }
    if (found.status !== "APPROVED") {
      throw new BadRequestException("Signatures are only recorded once approved.");
    }
    if (proof !== undefined && proof !== null && (proof.length === 0 || proof.length > 500)) {
      throw new BadRequestException("proof must be 1-500 characters when present.");
    }
    const existing = await this.store.listSignatures(id);
    if (existing.some((row) => row.signerId === actorId)) {
      throw new BadRequestException("Signer already signed this document.");
    }
    const saved = await this.store.recordSignature(id, actorId, proof ?? null);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "document.signed",
        entityType: "Signature",
        entityId: saved.id,
        metadata: { documentId: id },
      }),
    );
    return saved;
  }

  async listSignatures(id: string, orgId: string) {
    const found = await this.store.findDocument(id, orgId);
    if (!found) {
      throw new NotFoundException("Document not found.");
    }
    return this.store.listSignatures(id);
  }

  async requestPdf(orgId: string, actorId: string, id: string, version?: number) {
    const found = await this.store.findDocument(id, orgId);
    if (!found) {
      throw new NotFoundException("Document not found.");
    }
    const target = version ?? found.currentVersion;
    if (!Number.isInteger(target) || target < 1 || target > found.currentVersion) {
      throw new BadRequestException("version must reference an existing document version.");
    }
    const job = await this.store.enqueuePdfJob(orgId, id, target);
    if (job.created) {
      await this.store.writeAuditEvent(
        buildAuditEvent({
          orgId,
          actorId,
          action: "document.pdf_requested",
          entityType: "Document",
          entityId: id,
          metadata: { version: target, jobId: job.id },
        }),
      );
    }
    return { ...job, documentId: id, version: target };
  }
}
