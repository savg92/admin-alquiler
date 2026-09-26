import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AUDIT_STORE } from "./tokens";
import type { AuditStore } from "./store";

@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_STORE) private readonly store: AuditStore) {}

  async listEvents(
    orgId: string,
    filter: { entityType?: string; entityId?: string; action?: string; limit?: number },
  ) {
    if (
      filter.limit !== undefined &&
      (!Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > 500)
    ) {
      throw new BadRequestException("limit must be an integer between 1 and 500.");
    }
    return this.store.listAuditEvents(orgId, filter);
  }
}
