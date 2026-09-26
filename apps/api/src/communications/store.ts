export type CommsChannel = "IN_APP" | "EMAIL";

export interface NotificationRow {
  id: string;
  userId: string | null;
  channel: CommsChannel;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface PreferenceRow {
  userId: string;
  channel: CommsChannel;
  enabled: boolean;
}

export interface CommunicationRow {
  id: string;
  sender: string;
  recipients: Record<string, unknown>;
  subject: string | null;
  body: string;
  locale: string;
  related: Record<string, unknown> | null;
  sentAt: Date;
}

export interface TemplateRow {
  id: string;
  orgId: string | null;
  key: string;
  locale: string;
  subject: string | null;
  body: string;
}

export interface OutboxRow {
  id: string;
  type: string;
  processedAt: Date | null;
  attempts: number;
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface CommunicationsStore {
  createNotification(
    orgId: string,
    data: { userId: string | null; channel: CommsChannel; title: string; body: string },
  ): Promise<NotificationRow>;
  listNotifications(
    orgId: string,
    userId: string,
    unreadOnly?: boolean,
  ): Promise<NotificationRow[]>;
  markNotificationRead(id: string, orgId: string, userId: string): Promise<NotificationRow | null>;
  getPreferences(orgId: string, userId: string): Promise<PreferenceRow[]>;
  setPreference(
    orgId: string,
    userId: string,
    channel: CommsChannel,
    enabled: boolean,
  ): Promise<PreferenceRow>;
  isChannelEnabled(orgId: string, userId: string | null, channel: CommsChannel): Promise<boolean>;
  createCommunication(
    orgId: string,
    data: {
      sender: string;
      recipients: Record<string, unknown>;
      subject: string | null;
      body: string;
      locale: string;
      related: Record<string, unknown> | null;
    },
  ): Promise<CommunicationRow>;
  listCommunications(orgId: string): Promise<CommunicationRow[]>;
  upsertTemplate(
    orgId: string | null,
    data: { key: string; locale: string; subject: string | null; body: string },
  ): Promise<TemplateRow>;
  findTemplate(orgId: string, key: string, locale: string): Promise<TemplateRow | null>;
  listTemplates(orgId: string): Promise<TemplateRow[]>;
  enqueueOutbox(
    orgId: string,
    aggregateType: string,
    aggregateId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<OutboxRow>;
  pendingOutbox(orgId: string, limit: number): Promise<(OutboxRow & { payload: unknown })[]>;
  markOutboxProcessed(id: string, error: string | null): Promise<void>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
