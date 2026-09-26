import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  renderTemplate,
  validateLocale,
  validateTemplate,
} from "@admin-alquiler/domain";
import { COMMUNICATIONS_STORE } from "./tokens";
import type { CommunicationsStore, CommsChannel } from "./store";

function parseTitle(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new BadRequestException("title must be 1-200 characters.");
  }
  return value.trim();
}

function parseBody(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 20000) {
    throw new BadRequestException("body must be 1-20000 characters.");
  }
  return value;
}

@Injectable()
export class CommunicationsService {
  constructor(@Inject(COMMUNICATIONS_STORE) private readonly store: CommunicationsStore) {}

  async notify(
    orgId: string,
    actorId: string,
    input: { userId?: string | null; channel: CommsChannel; title: string; body: string },
  ) {
    if (input.channel !== "IN_APP" && input.channel !== "EMAIL") {
      throw new BadRequestException('channel must be "IN_APP" or "EMAIL".');
    }
    const title = parseTitle(input.title);
    const body = parseBody(input.body);
    if (
      input.userId !== undefined &&
      input.userId !== null &&
      !(await this.store.isChannelEnabled(orgId, input.userId, input.channel))
    ) {
      throw new BadRequestException("Recipient disabled this notification channel.");
    }
    const created = await this.store.createNotification(orgId, {
      userId: input.userId ?? null,
      channel: input.channel,
      title,
      body,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "notification.sent",
        entityType: "Notification",
        entityId: created.id,
        metadata: { channel: input.channel },
      }),
    );
    return created;
  }

  async myNotifications(orgId: string, userId: string, unreadOnly?: boolean) {
    return this.store.listNotifications(orgId, userId, unreadOnly);
  }

  async markRead(orgId: string, userId: string, id: string) {
    const updated = await this.store.markNotificationRead(id, orgId, userId);
    if (!updated) {
      throw new NotFoundException("Notification not found.");
    }
    return updated;
  }

  async myPreferences(orgId: string, userId: string) {
    return this.store.getPreferences(orgId, userId);
  }

  async setPreference(orgId: string, userId: string, channel: CommsChannel, enabled: boolean) {
    if (channel !== "IN_APP" && channel !== "EMAIL") {
      throw new BadRequestException('channel must be "IN_APP" or "EMAIL".');
    }
    return this.store.setPreference(orgId, userId, channel, enabled);
  }

  async sendCommunication(
    orgId: string,
    actorId: string,
    input: {
      channel: CommsChannel;
      recipients: { users?: string[]; emails?: string[] };
      subject?: string | null;
      body?: string;
      locale: string;
      templateKey?: string;
      templateVars?: Record<string, string | number>;
      related?: Record<string, unknown> | null;
    },
  ) {
    if (input.channel !== "IN_APP" && input.channel !== "EMAIL") {
      throw new BadRequestException('channel must be "IN_APP" or "EMAIL".');
    }
    let locale: string;
    try {
      locale = validateLocale(input.locale);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid locale.");
    }
    const users = input.recipients.users ?? [];
    const emails = input.recipients.emails ?? [];
    if (users.length + emails.length === 0) {
      throw new BadRequestException("At least one recipient is required.");
    }
    for (const email of emails) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException(`Invalid email recipient "${email}".`);
      }
    }
    let subject = input.subject ?? null;
    let body = input.body;
    if (input.templateKey !== undefined) {
      const template = await this.store.findTemplate(orgId, input.templateKey, locale);
      if (!template) {
        throw new NotFoundException("Template not found for key/locale.");
      }
      const vars = input.templateVars ?? {};
      try {
        body = renderTemplate(template.body, vars);
        if (template.subject !== null) {
          subject = renderTemplate(template.subject, vars);
        }
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : "Invalid template variables.",
        );
      }
    }
    if (body === undefined) {
      throw new BadRequestException("body or templateKey is required.");
    }
    const text = parseBody(body);
    const record = await this.store.createCommunication(orgId, {
      sender: actorId,
      recipients: { channel: input.channel, users, emails },
      subject,
      body: text,
      locale,
      related: input.related ?? null,
    });
    const notifications: { userId: string; id: string }[] = [];
    const skipped: string[] = [];
    if (input.channel === "IN_APP") {
      for (const userId of users) {
        if (!(await this.store.isChannelEnabled(orgId, userId, "IN_APP"))) {
          skipped.push(userId);
          continue;
        }
        const created = await this.store.createNotification(orgId, {
          userId,
          channel: "IN_APP",
          title: subject ?? "Notificación",
          body: text,
        });
        notifications.push({ userId, id: created.id });
      }
    }
    const queued: { email: string; outboxId: string }[] = [];
    if (input.channel === "EMAIL") {
      for (const email of emails) {
        const event = await this.store.enqueueOutbox(
          orgId,
          "Communication",
          record.id,
          "email.send",
          {
            to: email,
            subject,
            body: text,
            locale,
            communicationId: record.id,
          },
        );
        queued.push({ email, outboxId: event.id });
      }
    }
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "communication.sent",
        entityType: "Communication",
        entityId: record.id,
        metadata: { channel: input.channel, templateKey: input.templateKey ?? null },
      }),
    );
    return { communication: record, notifications, skipped, queued };
  }

  async listCommunications(orgId: string) {
    return this.store.listCommunications(orgId);
  }

  async upsertTemplate(
    orgId: string,
    actorId: string,
    input: { key: string; locale: string; subject?: string | null; body: string },
  ) {
    try {
      validateTemplate(
        input.subject === undefined || input.subject === null
          ? { key: input.key, locale: input.locale, body: input.body }
          : { key: input.key, locale: input.locale, subject: input.subject, body: input.body },
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid template.");
    }
    const saved = await this.store.upsertTemplate(orgId, {
      key: input.key,
      locale: input.locale,
      subject: input.subject ?? null,
      body: input.body,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "communication_template.saved",
        entityType: "CommunicationTemplate",
        entityId: saved.id,
        metadata: { key: input.key, locale: input.locale },
      }),
    );
    return saved;
  }

  async listTemplates(orgId: string) {
    return this.store.listTemplates(orgId);
  }

  async pendingOutbox(orgId: string, limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException("limit must be an integer between 1 and 100.");
    }
    return this.store.pendingOutbox(orgId, limit);
  }

  async markOutbox(orgId: string, actorId: string, id: string, error?: string | null) {
    const pending = await this.store.pendingOutbox(orgId, 100);
    if (!pending.some((row) => row.id === id)) {
      throw new NotFoundException("Pending outbox event not found.");
    }
    await this.store.markOutboxProcessed(id, error ?? null);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: error ? "outbox.retry_queued" : "outbox.processed",
        entityType: "OutboxEvent",
        entityId: id,
      }),
    );
    return { id, processed: !error };
  }
}
