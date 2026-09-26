export type AttachmentKind = "PHOTO" | "RECORD" | "DOCUMENT";

export const ATTACHMENT_KINDS: readonly AttachmentKind[] = ["PHOTO", "RECORD", "DOCUMENT"];

export const ATTACHMENT_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const STORAGE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,178}[A-Za-z0-9]$/;

export interface AttachmentInput {
  kind: unknown;
  storageKey: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
  unitId?: unknown;
  capturedAt?: unknown;
}

export interface ValidAttachment {
  kind: AttachmentKind;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  unitId: string | null;
  capturedAt: Date | null;
}

function parseOptionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid date for "${field}".`);
  }
  return new Date(value);
}

export function validateAttachment(input: AttachmentInput): ValidAttachment {
  if (!ATTACHMENT_KINDS.includes(input.kind as AttachmentKind)) {
    throw new Error(`"kind" must be one of: ${ATTACHMENT_KINDS.join(", ")}.`);
  }
  if (typeof input.storageKey !== "string" || !STORAGE_KEY_PATTERN.test(input.storageKey)) {
    throw new Error(
      `"storageKey" must be a safe relative object key (letters, numbers, ., _, -, /; no "..").`,
    );
  }
  if (input.storageKey.includes("..")) {
    throw new Error(`"storageKey" must not contain "..".`);
  }
  if (typeof input.mimeType !== "string" || !ATTACHMENT_MIME_TYPES.includes(input.mimeType)) {
    throw new Error(`"mimeType" must be one of: ${ATTACHMENT_MIME_TYPES.join(", ")}.`);
  }
  if (
    typeof input.sizeBytes !== "number" ||
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > MAX_ATTACHMENT_BYTES
  ) {
    throw new Error(`"sizeBytes" must be an integer between 1 and ${MAX_ATTACHMENT_BYTES}.`);
  }
  return {
    kind: input.kind as AttachmentKind,
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    unitId: typeof input.unitId === "string" && input.unitId.length > 0 ? input.unitId : null,
    capturedAt: parseOptionalDate(input.capturedAt, "capturedAt"),
  };
}
