export interface AIModelRow {
  id: string;
  modelId: string;
  version: string;
  provider: string;
  runtime: string;
  quantization: string | null;
  capabilities: string[];
  contextSize: number | null;
  languages: string[];
  privacyTier: string;
  hardware: Record<string, unknown> | null;
  status: string;
  score: number | null;
}

export interface ObservationRow {
  id: string;
  modelId: string;
  questionType: string;
  confidence: number;
  correct: boolean;
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface AiStore {
  registerModel(data: {
    modelId: string;
    version: string;
    provider: string;
    runtime: string;
    quantization: string | null;
    capabilities: string[];
    contextSize: number | null;
    languages: string[];
    privacyTier: string;
    hardware: Record<string, unknown> | null;
  }): Promise<AIModelRow>;
  listModels(filter: { status?: string; runtime?: string }): Promise<AIModelRow[]>;
  findModel(modelId: string): Promise<AIModelRow | null>;
  setModelStatus(modelId: string, status: string): Promise<AIModelRow>;
  setModelScore(modelId: string, score: number): Promise<AIModelRow>;
  recordObservation(data: {
    orgId: string | null;
    modelId: string;
    questionType: string;
    confidence: number;
    correct: boolean;
  }): Promise<ObservationRow>;
  listObservations(modelId: string, questionType: string, since?: Date): Promise<ObservationRow[]>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
