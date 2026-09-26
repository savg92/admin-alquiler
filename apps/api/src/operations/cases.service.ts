import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  canTransitionCase,
  parseCaseStatus,
  validateCaseText,
  validateCountryCode,
  validateHouseRuleBody,
  validateTaxLabel,
  type CaseStatus,
} from "@admin-alquiler/domain";
import { OPERATIONS_STORE } from "./tokens";
import type { OperationsStore } from "./store";

@Injectable()
export class CasesService {
  constructor(@Inject(OPERATIONS_STORE) private readonly store: OperationsStore) {}

  private async requireProperty(propertyId: string, orgId: string) {
    const property = await this.store.findProperty(propertyId, orgId);
    if (!property) {
      throw new NotFoundException("Property not found.");
    }
    return property;
  }

  async createComplaint(
    orgId: string,
    actorId: string,
    input: { propertyId: string; reporter: string; subject: string; body: string },
  ) {
    await this.requireProperty(input.propertyId, orgId);
    if (input.reporter.trim().length === 0 || input.reporter.length > 200) {
      throw new BadRequestException("reporter must be 1-200 characters.");
    }
    try {
      validateCaseText(input.subject, input.body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid complaint.");
    }
    const created = await this.store.createComplaint(orgId, {
      propertyId: input.propertyId,
      reporter: input.reporter.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "complaint.created",
        entityType: "Complaint",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listComplaints(orgId: string, propertyId?: string) {
    if (propertyId !== undefined) {
      await this.requireProperty(propertyId, orgId);
    }
    return this.store.listComplaints(orgId, ...(propertyId === undefined ? [] : [propertyId]));
  }

  async transitionComplaint(orgId: string, actorId: string, id: string, to: string) {
    return this.transitionCase(orgId, actorId, "complaint", id, to);
  }

  async createClaim(
    orgId: string,
    actorId: string,
    input: { propertyId: string; subject: string; body: string },
  ) {
    await this.requireProperty(input.propertyId, orgId);
    try {
      validateCaseText(input.subject, input.body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid claim.");
    }
    const created = await this.store.createClaim(orgId, {
      propertyId: input.propertyId,
      subject: input.subject.trim(),
      body: input.body.trim(),
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "claim.created",
        entityType: "Claim",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listClaims(orgId: string, propertyId?: string) {
    if (propertyId !== undefined) {
      await this.requireProperty(propertyId, orgId);
    }
    return this.store.listClaims(orgId, ...(propertyId === undefined ? [] : [propertyId]));
  }

  async transitionClaim(orgId: string, actorId: string, id: string, to: string) {
    return this.transitionCase(orgId, actorId, "claim", id, to);
  }

  private async transitionCase(
    orgId: string,
    actorId: string,
    kind: "complaint" | "claim",
    id: string,
    to: string,
  ) {
    let status: CaseStatus;
    try {
      status = parseCaseStatus(to);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid status.");
    }
    const found =
      kind === "complaint"
        ? await this.store.findComplaint(id, orgId)
        : await this.store.findClaim(id, orgId);
    if (!found) {
      throw new NotFoundException(
        kind === "complaint" ? "Complaint not found." : "Claim not found.",
      );
    }
    const from = found.status as CaseStatus;
    if (!canTransitionCase(from, status)) {
      throw new BadRequestException(`Cannot transition from ${from} to ${status}.`);
    }
    const updated =
      kind === "complaint"
        ? await this.store.setComplaintStatus(id, status)
        : await this.store.setClaimStatus(id, status);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: kind === "complaint" ? "complaint.status_changed" : "claim.status_changed",
        entityType: kind === "complaint" ? "Complaint" : "Claim",
        entityId: id,
        metadata: { from, to: status },
      }),
    );
    return updated;
  }

  async createTaxRecord(
    orgId: string,
    actorId: string,
    input: { country: string; label: string; dueDate: string; receiptRef?: string | null },
  ) {
    let country: string;
    let label: string;
    try {
      country = validateCountryCode(input.country);
      label = validateTaxLabel(input.label);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid tax record.");
    }
    const dueDate = new Date(input.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Invalid date "dueDate".');
    }
    let receiptRef: string | null = null;
    if (input.receiptRef !== undefined && input.receiptRef !== null) {
      if (typeof input.receiptRef !== "string" || input.receiptRef.length > 200) {
        throw new BadRequestException("receiptRef must be at most 200 characters.");
      }
      receiptRef = input.receiptRef;
    }
    const created = await this.store.createTaxRecord(orgId, {
      country,
      label,
      dueDate,
      receiptRef,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "tax.recorded",
        entityType: "TaxRecord",
        entityId: created.id,
      }),
    );
    return created;
  }

  async upcomingDeadlines(orgId: string, withinDays: number) {
    if (!Number.isInteger(withinDays) || withinDays < 1 || withinDays > 365) {
      throw new BadRequestException("withinDays must be an integer between 1 and 365.");
    }
    const before = new Date(Date.now() + withinDays * 86_400_000);
    const rows = await this.store.listTaxRecords(orgId, before);
    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      daysRemaining: Math.ceil((row.dueDate.getTime() - now) / 86_400_000),
    }));
  }

  async publishHouseRule(orgId: string, actorId: string, propertyId: string, body: string) {
    await this.requireProperty(propertyId, orgId);
    let clean: string;
    try {
      clean = validateHouseRuleBody(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid house rule.");
    }
    const created = await this.store.createHouseRule(propertyId, clean);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "house_rule.published",
        entityType: "HouseRule",
        entityId: created.id,
        metadata: { propertyId, version: created.version },
      }),
    );
    return created;
  }

  async listHouseRules(propertyId: string, orgId: string) {
    await this.requireProperty(propertyId, orgId);
    return this.store.listHouseRules(propertyId);
  }
}
