import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  validateDocumentBody,
  validateDocumentTitle,
  validateLocale,
  validateTemplateName,
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
}
