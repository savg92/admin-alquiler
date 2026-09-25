export interface AuditEventInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEvent extends AuditEventInput {
  createdAt: string;
}

export function buildAuditEvent(input: AuditEventInput, now: number = Date.now()): AuditEvent {
  if (input.action.trim().length === 0) {
    throw new Error("Audit action must not be empty.");
  }
  return { ...input, createdAt: new Date(now).toISOString() };
}
