import type { DataClass } from "@admin-alquiler/ai";

export interface FeatureDefinition {
  key: string;
  dataClasses: readonly DataClass[];
  schema?: Record<string, unknown>;
  action?: string;
}

export const MAINTENANCE_CATEGORIES = [
  "plumbing",
  "electrical",
  "structural",
  "appliance",
  "cleaning",
  "security",
  "common-areas",
  "other",
] as const;

export const URGENCY_LEVELS = ["low", "medium", "high", "critical"] as const;

export const COMPLAINT_TYPES = [
  "noise",
  "neighbors",
  "common_areas",
  "security",
  "administrative",
  "other",
] as const;

export const EXTRACTION_FIELDS = {
  documentType: {
    type: "string",
    enum: ["lease", "receipt", "invoice", "deposit_receipt", "inspection", "other"],
  },
  parties: { type: "array" },
  startDate: { type: "string" },
  endDate: { type: "string" },
  monthlyRentMinor: { type: "number" },
  currency: { type: "string" },
} as const;

const FEATURE_TABLE = {
  "document-draft": {
    key: "document-draft",
    dataClasses: ["LEGAL", "FINANCIAL", "PERSONAL"],
    action: "document.approve",
  },
  "communication-assist": {
    key: "communication-assist",
    dataClasses: ["INTERNAL"],
  },
  summarization: {
    key: "summarization",
    dataClasses: ["INTERNAL"],
  },
  extraction: {
    key: "extraction",
    dataClasses: ["LEGAL", "PERSONAL", "FINANCIAL"],
    schema: {
      type: "object",
      required: ["documentType"],
      properties: {
        documentType: EXTRACTION_FIELDS.documentType,
        parties: EXTRACTION_FIELDS.parties,
        startDate: EXTRACTION_FIELDS.startDate,
        endDate: EXTRACTION_FIELDS.endDate,
        monthlyRentMinor: EXTRACTION_FIELDS.monthlyRentMinor,
        currency: EXTRACTION_FIELDS.currency,
      },
    },
  },
  classification: {
    key: "classification",
    dataClasses: ["INTERNAL"],
    schema: {
      type: "object",
      required: ["category", "urgency"],
      properties: {
        category: { type: "string", enum: [...MAINTENANCE_CATEGORIES] },
        urgency: { type: "string", enum: [...URGENCY_LEVELS] },
        summary: { type: "string" },
        complaintType: { type: "string", enum: [...COMPLAINT_TYPES] },
      },
    },
  },
  vision: {
    key: "vision",
    dataClasses: ["PERSONAL", "SENSITIVE"],
  },
} satisfies Record<string, FeatureDefinition>;

export type FeatureKey = keyof typeof FEATURE_TABLE;

export const FEATURES: Record<FeatureKey, FeatureDefinition> = FEATURE_TABLE;

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function isFeatureKey(value: string): value is FeatureKey {
  return Object.prototype.hasOwnProperty.call(FEATURES, value);
}
