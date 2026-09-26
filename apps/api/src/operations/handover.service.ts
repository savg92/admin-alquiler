import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  parseHandoverKind,
  validateDepositDeductionAmount,
  type HandoverKind,
} from "@admin-alquiler/domain";
import { DocumentsService } from "../documents/documents.service";
import { RentalService } from "../rental/rental.service";
import { OPERATIONS_STORE } from "./tokens";
import type { OperationsStore } from "./store";

@Injectable()
export class HandoverService {
  constructor(
    @Inject(OPERATIONS_STORE) private readonly store: OperationsStore,
    private readonly rental: RentalService,
    private readonly documents: DocumentsService,
  ) {}

  async recordHandover(
    orgId: string,
    actorId: string,
    input: {
      propertyId: string;
      unitId?: string;
      contractId?: string;
      kind: string;
      notes?: string | null;
      evidence?: Record<string, unknown> | null;
      depositDeduction?: { depositId: string; amount: number } | null;
    },
  ) {
    const property = await this.store.findProperty(input.propertyId, orgId);
    if (!property) {
      throw new NotFoundException("Property not found.");
    }
    let kind: HandoverKind;
    try {
      kind = parseHandoverKind(input.kind);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid kind.");
    }
    let unitId: string | null = null;
    if (input.unitId !== undefined) {
      const unit = await this.store.findUnit(input.unitId);
      if (!unit || unit.propertyId !== input.propertyId) {
        throw new NotFoundException("Unit not found for this property.");
      }
      unitId = unit.id;
    }
    let contractId: string | null = null;
    if (input.contractId !== undefined) {
      const contract = await this.rental.getContract(input.contractId, orgId);
      if (contract.propertyId !== input.propertyId) {
        throw new BadRequestException("Contract does not belong to this property.");
      }
      contractId = contract.id;
    }
    let notes: string | null = null;
    if (input.notes !== undefined && input.notes !== null) {
      if (typeof input.notes !== "string" || input.notes.length > 5000) {
        throw new BadRequestException("notes must be at most 5000 characters.");
      }
      notes = input.notes;
    }
    if (
      input.evidence !== undefined &&
      input.evidence !== null &&
      typeof input.evidence !== "object"
    ) {
      throw new BadRequestException("evidence must be an object when present.");
    }
    let deduction: { depositId: string; amountMinor: number } | null = null;
    let deductionQuote: { depositId: string; amountMinor: number; remainingMinor: number } | null =
      null;
    if (input.depositDeduction !== undefined && input.depositDeduction !== null) {
      const { depositId, amount } = input.depositDeduction;
      let amountMinor: number;
      try {
        amountMinor = validateDepositDeductionAmount(amount);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : "Invalid deduction.",
        );
      }
      const deposit = await this.rental.getDeposit(depositId, orgId);
      if (contractId !== null && deposit.contractId !== contractId) {
        throw new BadRequestException("Deposit does not belong to this contract.");
      }
      if (amountMinor > deposit.remainingMinor) {
        throw new BadRequestException("Deduction exceeds the remaining deposit balance.");
      }
      deduction = { depositId, amountMinor };
      deductionQuote = { depositId, amountMinor, remainingMinor: deposit.remainingMinor };
    }
    const document = await this.documents.createDocument(orgId, actorId, {
      title: `Acta de entrega ${kind === "CHECKIN" ? "de entrada" : "de salida"} ${new Date().toISOString().slice(0, 10)}`,
      body: [
        `Acta de entrega (${kind}).`,
        `Propiedad: ${input.propertyId}.`,
        ...(unitId ? [`Unidad: ${unitId}.`] : []),
        ...(contractId ? [`Contrato: ${contractId}.`] : []),
        ...(notes ? [`Notas: ${notes}`] : []),
        ...(deduction
          ? [
              `Deducción de depósito propuesta: ${deduction.amountMinor} minor (depósito ${deduction.depositId}). Se registra vía el endpoint de depósitos.`,
            ]
          : []),
      ].join("\n"),
    });
    const created = await this.store.createHandover(orgId, {
      propertyId: property.id,
      unitId,
      contractId,
      maintenanceId: null,
      kind,
      notes,
      evidence: input.evidence ?? null,
      documentId: document.id,
      depositDeduction: deduction,
      recordedBy: actorId,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "handover.recorded",
        entityType: "Handover",
        entityId: created.id,
        metadata: { kind, documentId: document.id },
      }),
    );
    return { handover: created, documentId: document.id, deductionQuote };
  }

  async listHandovers(orgId: string, propertyId?: string) {
    if (propertyId !== undefined) {
      const property = await this.store.findProperty(propertyId, orgId);
      if (!property) {
        throw new NotFoundException("Property not found.");
      }
    }
    return this.store.listHandovers(orgId, ...(propertyId === undefined ? [] : [propertyId]));
  }

  async getHandover(id: string, orgId: string) {
    const found = await this.store.findHandover(id, orgId);
    if (!found) {
      throw new NotFoundException("Handover not found.");
    }
    return found;
  }
}
