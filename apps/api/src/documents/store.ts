export interface DocTemplateRow {
  id: string;
  name: string;
  language: string;
  version: number;
  body: string;
}

export interface DocumentRow {
  id: string;
  templateId: string | null;
  title: string;
  status: string;
  currentVersion: number;
}

export interface VersionRow {
  id: string;
  documentId: string;
  version: number;
  body: string;
  storageRef: string | null;
}

export interface ApprovalRow {
  id: string;
  documentId: string;
  approverId: string;
  approved: boolean | null;
  decidedAt: Date | null;
}

export interface SignatureRow {
  id: string;
  documentId: string;
  signerId: string;
  signedAt: Date;
  proof: string | null;
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentsStore {
  createTemplate(
    orgId: string,
    data: { name: string; language: string; body: string },
  ): Promise<DocTemplateRow>;
  listTemplates(orgId: string): Promise<DocTemplateRow[]>;
  findTemplate(id: string, orgId: string): Promise<DocTemplateRow | null>;
  updateTemplateBody(id: string, body: string): Promise<DocTemplateRow>;
  createDocument(
    orgId: string,
    data: { templateId: string | null; title: string; body: string },
  ): Promise<DocumentRow>;
  listDocuments(orgId: string, status?: string): Promise<DocumentRow[]>;
  findDocument(id: string, orgId: string): Promise<DocumentRow | null>;
  setDocumentStatus(id: string, status: string): Promise<DocumentRow>;
  saveVersion(
    documentId: string,
    data: { body: string; storageRef: string | null },
  ): Promise<VersionRow>;
  listVersions(documentId: string): Promise<VersionRow[]>;
  recordApproval(documentId: string, approverId: string, approved: boolean): Promise<ApprovalRow>;
  listApprovals(documentId: string): Promise<ApprovalRow[]>;
  recordSignature(
    documentId: string,
    signerId: string,
    proof: string | null,
  ): Promise<SignatureRow>;
  listSignatures(documentId: string): Promise<SignatureRow[]>;
  enqueuePdfJob(
    orgId: string,
    documentId: string,
    version: number,
  ): Promise<{ id: string; created: boolean }>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
