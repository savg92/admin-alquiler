export type DocumentStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "SIGNED" | "FINAL" | "ARCHIVED";

const TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["SIGNED", "ARCHIVED"],
  SIGNED: ["FINAL", "ARCHIVED"],
  FINAL: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionDocument(from: DocumentStatus, to: DocumentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateDocumentTitle(title: string): string {
  if (title.trim().length === 0 || title.length > 200) {
    throw new Error("Document title must be 1-200 characters.");
  }
  return title.trim();
}

export function validateDocumentBody(body: string): string {
  if (body.trim().length === 0 || body.length > 200000) {
    throw new Error("Document body must be 1-200000 characters.");
  }
  return body;
}

export function validateTemplateName(name: string): string {
  if (name.trim().length === 0 || name.length > 120) {
    throw new Error("Template name must be 1-120 characters.");
  }
  return name.trim();
}
