export interface AuditEventRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  createdAt: Date;
}

export interface AuditStore {
  listAuditEvents(
    orgId: string,
    filter: { entityType?: string; entityId?: string; action?: string; limit?: number },
  ): Promise<AuditEventRow[]>;
}
