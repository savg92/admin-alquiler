import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { buildAuditEvent } from "@admin-alquiler/domain";
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
}
