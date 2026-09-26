import { prisma } from "@admin-alquiler/database";
import type {
  AuditInput,
  CommsChannel,
  CommunicationRow,
  CommunicationsStore,
  NotificationRow,
  OutboxRow,
  PreferenceRow,
  TemplateRow,
} from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

export class PrismaCommunicationsStore implements CommunicationsStore {
  async createNotification(
    orgId: string,
    data: { userId: string | null; channel: CommsChannel; title: string; body: string },
  ): Promise<NotificationRow> {
    const created = await prisma.notification.create({
      data: {
        orgId,
        userId: data.userId,
        channel: data.channel,
        title: data.title,
        body: data.body,
      },
    });
    return {
      id: created.id,
      userId: created.userId,
      channel: created.channel,
      title: created.title,
      body: created.body,
      readAt: created.readAt,
      createdAt: created.createdAt,
    };
  }

  async listNotifications(
    orgId: string,
    userId: string,
    unreadOnly?: boolean,
  ): Promise<NotificationRow[]> {
    const rows = await prisma.notification.findMany({
      where: {
        orgId,
        OR: [{ userId }, { userId: null }],
        ...(unreadOnly === true ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      channel: row.channel,
      title: row.title,
      body: row.body,
      readAt: row.readAt,
      createdAt: row.createdAt,
    }));
  }

  async markNotificationRead(
    id: string,
    orgId: string,
    userId: string,
  ): Promise<NotificationRow | null> {
    const found = await prisma.notification.findFirst({
      where: { id, orgId, OR: [{ userId }, { userId: null }] },
    });
    if (!found) {
      return null;
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return {
      id: updated.id,
      userId: updated.userId,
      channel: updated.channel,
      title: updated.title,
      body: updated.body,
      readAt: updated.readAt,
      createdAt: updated.createdAt,
    };
  }

  async getPreferences(orgId: string, userId: string): Promise<PreferenceRow[]> {
    const rows = await prisma.notificationPreference.findMany({ where: { orgId, userId } });
    return rows.map((row) => ({ userId: row.userId, channel: row.channel, enabled: row.enabled }));
  }

  async setPreference(
    orgId: string,
    userId: string,
    channel: CommsChannel,
    enabled: boolean,
  ): Promise<PreferenceRow> {
    const saved = await prisma.notificationPreference.upsert({
      where: { orgId_userId_channel: { orgId, userId, channel } },
      create: { orgId, userId, channel, enabled },
      update: { enabled },
    });
    return { userId: saved.userId, channel: saved.channel, enabled: saved.enabled };
  }

  async isChannelEnabled(
    orgId: string,
    userId: string | null,
    channel: CommsChannel,
  ): Promise<boolean> {
    if (userId === null) {
      return true;
    }
    const row = await prisma.notificationPreference.findUnique({
      where: { orgId_userId_channel: { orgId, userId, channel } },
    });
    return row?.enabled ?? true;
  }

  async createCommunication(
    orgId: string,
    data: {
      sender: string;
      recipients: Record<string, unknown>;
      subject: string | null;
      body: string;
      locale: string;
    },
  ): Promise<CommunicationRow> {
    const created = await prisma.communication.create({
      data: {
        orgId,
        sender: data.sender,
        recipients: toJsonInput(data.recipients),
        subject: data.subject,
        body: data.body,
        locale: data.locale,
      },
    });
    return {
      id: created.id,
      sender: created.sender,
      recipients: (created.recipients ?? {}) as Record<string, unknown>,
      subject: created.subject,
      body: created.body,
      locale: created.locale,
      sentAt: created.sentAt,
    };
  }

  async listCommunications(orgId: string): Promise<CommunicationRow[]> {
    const rows = await prisma.communication.findMany({
      where: { orgId },
      orderBy: { sentAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      sender: row.sender,
      recipients: (row.recipients ?? {}) as Record<string, unknown>,
      subject: row.subject,
      body: row.body,
      locale: row.locale,
      sentAt: row.sentAt,
    }));
  }

  async upsertTemplate(
    orgId: string | null,
    data: { key: string; locale: string; subject: string | null; body: string },
  ): Promise<TemplateRow> {
    const existing = await prisma.communicationTemplate.findFirst({
      where: { orgId, key: data.key, locale: data.locale },
    });
    if (existing) {
      const updated = await prisma.communicationTemplate.update({
        where: { id: existing.id },
        data: { subject: data.subject, body: data.body },
      });
      return {
        id: updated.id,
        orgId: updated.orgId,
        key: updated.key,
        locale: updated.locale,
        subject: updated.subject,
        body: updated.body,
      };
    }
    const created = await prisma.communicationTemplate.create({
      data: { orgId, key: data.key, locale: data.locale, subject: data.subject, body: data.body },
    });
    return {
      id: created.id,
      orgId: created.orgId,
      key: created.key,
      locale: created.locale,
      subject: created.subject,
      body: created.body,
    };
  }

  async findTemplate(orgId: string, key: string, locale: string): Promise<TemplateRow | null> {
    const scoped =
      (await prisma.communicationTemplate.findFirst({ where: { orgId, key, locale } })) ??
      (await prisma.communicationTemplate.findFirst({ where: { orgId: null, key, locale } }));
    if (!scoped) {
      return null;
    }
    return {
      id: scoped.id,
      orgId: scoped.orgId,
      key: scoped.key,
      locale: scoped.locale,
      subject: scoped.subject,
      body: scoped.body,
    };
  }

  async listTemplates(orgId: string): Promise<TemplateRow[]> {
    const rows = await prisma.communicationTemplate.findMany({
      where: { OR: [{ orgId }, { orgId: null }] },
      orderBy: [{ key: "asc" }, { locale: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      key: row.key,
      locale: row.locale,
      subject: row.subject,
      body: row.body,
    }));
  }

  async enqueueOutbox(
    orgId: string,
    aggregateType: string,
    aggregateId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<OutboxRow> {
    const created = await prisma.outboxEvent.create({
      data: { orgId, aggregateType, aggregateId, type, payload: toJsonInput(payload) },
      select: { id: true, type: true, processedAt: true, attempts: true },
    });
    return created;
  }

  async pendingOutbox(orgId: string, limit: number): Promise<(OutboxRow & { payload: unknown })[]> {
    const rows = await prisma.outboxEvent.findMany({
      where: { orgId, processedAt: null },
      orderBy: { occurredAt: "asc" },
      take: Math.max(1, Math.min(limit, 100)),
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      processedAt: row.processedAt,
      attempts: row.attempts,
      payload: row.payload,
    }));
  }

  async markOutboxProcessed(id: string, error: string | null): Promise<void> {
    if (error === null) {
      await prisma.outboxEvent.update({ where: { id }, data: { processedAt: new Date() } });
      return;
    }
    await prisma.outboxEvent.update({ where: { id }, data: { attempts: { increment: 1 } } });
  }

  async writeAuditEvent(event: AuditInput): Promise<void> {
    await prisma.auditEvent.create({
      data: {
        ...(event.orgId === undefined ? {} : { orgId: event.orgId }),
        ...(event.actorId === undefined ? {} : { actorId: event.actorId }),
        action: event.action,
        ...(event.entityType === undefined ? {} : { entityType: event.entityType }),
        ...(event.entityId === undefined ? {} : { entityId: event.entityId }),
        ...(event.metadata === undefined ? {} : { metadata: toJsonInput(event.metadata) }),
      },
    });
  }
}
