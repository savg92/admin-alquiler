export type SuggestionStatus = "PENDING" | "CONFIRMED" | "REJECTED";

export interface SuggestionRow {
  id: string;
  orgId: string;
  actorId: string;
  feature: string;
  status: SuggestionStatus;
  payload: Record<string, unknown>;
  confidence: number | null;
  requiresConfirmation: boolean;
  sourceRuntime: string | null;
  sourceModel: string | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  createdAt: Date;
}

export interface SuggestionInput {
  orgId: string;
  actorId: string;
  feature: string;
  payload: Record<string, unknown>;
  confidence: number | null;
  requiresConfirmation: boolean;
  sourceRuntime: string | null;
  sourceModel: string | null;
}

export interface AiSuggestionStore {
  create(data: SuggestionInput): Promise<SuggestionRow>;
  find(id: string, orgId: string): Promise<SuggestionRow | null>;
  list(
    orgId: string,
    filter: { feature?: string; status?: SuggestionStatus },
  ): Promise<SuggestionRow[]>;
  decide(
    id: string,
    orgId: string,
    status: SuggestionStatus,
    decidedBy: string,
  ): Promise<SuggestionRow | null>;
  writeAuditEvent(event: {
    orgId?: string;
    actorId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
