import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  allocatePayment,
  buildAuditEvent,
  chargePaymentStatus,
  periodDueDate,
  renewalStage,
  validateCodeudorTerms,
  validateContractTerms,
  validateRenewalTerms,
} from "@admin-alquiler/domain";
import { RENTAL_STORE } from "./tokens";
import type { ChargeRow, CodeudorInput, ContractRow, RentalStore } from "./store";

const PAYMENT_METHODS = ["TRANSFER", "PSE", "CASH", "CHECK", "CARD", "OTHER"];

export interface ContractInput {
  propertyId: string;
  tenantId: string;
  number: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
}

export interface PaymentInput {
  amount: number;
  method: string;
  reference?: string | undefined;
  paidAt: string;
}

function toMajor(minor: number): number {
  return minor / 100;
}

function toMinor(major: number): number {
  if (!Number.isFinite(major) || major <= 0) {
    throw new BadRequestException("Amount must be a positive number.");
  }
  return Math.round(major * 100);
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`Invalid date for "${field}".`);
  }
  return new Date(value);
}

@Injectable()
export class RentalService {
  constructor(@Inject(RENTAL_STORE) private readonly store: RentalStore) {}

  async createContract(orgId: string, actorId: string, input: ContractInput): Promise<ContractRow> {
    if (input.number.trim().length === 0) {
      throw new BadRequestException("Contract number is required.");
    }
    const property = await this.store.findProperty(input.propertyId, orgId);
    if (!property) {
      throw new NotFoundException("Property not found.");
    }
    const tenant = await this.store.findTenant(input.tenantId, orgId);
    if (!tenant) {
      throw new NotFoundException("Tenant not found.");
    }
    if (await this.store.isContractNumberTaken(orgId, input.number.trim())) {
      throw new ConflictException("Contract number already exists.");
    }
    const rentAmountMinor = toMinor(input.rentAmount);
    try {
      validateContractTerms({
        startDate: input.startDate,
        endDate: input.endDate,
        rentAmountMinor,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid contract.");
    }
    const profile = await this.store.findOrgProfile(orgId);
    if (!profile) {
      throw new NotFoundException("Organization not found.");
    }
    const created = await this.store.createContract(orgId, {
      propertyId: input.propertyId,
      tenantId: input.tenantId,
      number: input.number.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      rentAmountMinor,
      currency: profile.currency,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "contract.created",
        entityType: "Contract",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listContracts(orgId: string): Promise<ContractRow[]> {
    return this.store.listContracts(orgId);
  }

  async getContract(id: string, orgId: string): Promise<ContractRow> {
    const found = await this.store.findContract(id, orgId);
    if (!found) {
      throw new NotFoundException("Contract not found.");
    }
    return found;
  }

  async generateMonthlyCharge(
    orgId: string,
    actorId: string,
    contractId: string,
    period: string,
  ): Promise<{ charge: ChargeRow; created: boolean }> {
    const contract = await this.getContract(contractId, orgId);
    let dueDate: Date;
    try {
      dueDate = periodDueDate(period);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid period.");
    }
    const existing = await this.store.findCharge(contractId, period, "RENT");
    if (existing) {
      return { charge: existing, created: false };
    }
    const charge = await this.store.createCharge({
      orgId,
      contractId,
      type: "RENT",
      description: `Canon ${period}`,
      amountMinor: contract.rentAmountMinor,
      currency: contract.currency,
      dueDate,
      period,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "charge.generated",
        entityType: "Charge",
        entityId: charge.id,
        metadata: { period },
      }),
    );
    return { charge, created: true };
  }

  async listCharges(contractId: string, orgId: string) {
    await this.getContract(contractId, orgId);
    const charges = await this.store.pendingChargeBalances(contractId);
    return charges;
  }

  async recordPayment(orgId: string, actorId: string, contractId: string, input: PaymentInput) {
    const contract = await this.getContract(contractId, orgId);
    const amountMinor = toMinor(input.amount);
    if (!PAYMENT_METHODS.includes(input.method)) {
      throw new BadRequestException(
        `Invalid method. Expected one of: ${PAYMENT_METHODS.join(", ")}.`,
      );
    }
    const paidAt = parseDate(input.paidAt, "paidAt");
    const payment = await this.store.createPayment({
      orgId,
      contractId,
      amountMinor,
      currency: contract.currency,
      method: input.method,
      reference: input.reference ?? null,
      paidAt,
    });
    const balances = await this.store.pendingChargeBalances(contractId);
    const { allocations, remainderMinor } = allocatePayment(balances, amountMinor);
    const paidByCharge = new Map<string, number>();
    for (const allocation of allocations) {
      await this.store.createAllocation(payment.id, allocation.chargeId, allocation.amountMinor);
      paidByCharge.set(
        allocation.chargeId,
        (paidByCharge.get(allocation.chargeId) ?? 0) + allocation.amountMinor,
      );
    }
    for (const balance of balances) {
      const paid = paidByCharge.get(balance.id) ?? 0;
      if (paid > 0) {
        await this.store.updateChargeStatus(
          balance.id,
          chargePaymentStatus(balance.balanceMinor, paid),
        );
      }
    }
    const receipt = await this.store.createReceipt(
      payment.id,
      `R-${payment.id.slice(-8).toUpperCase()}`,
      "es-CO",
    );
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "payment.recorded",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { amountMinor, remainderMinor },
      }),
    );
    return {
      id: payment.id,
      amount: toMajor(amountMinor),
      allocations: allocations.map((allocation) => ({
        chargeId: allocation.chargeId,
        amount: toMajor(allocation.amountMinor),
      })),
      remainder: toMajor(remainderMinor),
      receipt,
    };
  }

  async getReceipt(id: string, orgId: string) {
    const found = await this.store.findReceipt(id, orgId);
    if (!found) {
      throw new NotFoundException("Receipt not found.");
    }
    return found;
  }

  async addCodeudor(orgId: string, actorId: string, contractId: string, input: CodeudorInput) {
    await this.getContract(contractId, orgId);
    if (input.name.trim().length === 0) {
      throw new BadRequestException("Codeudor name is required.");
    }
    try {
      validateCodeudorTerms({
        name: input.name,
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid codeudor.");
    }
    parseDate(input.validFrom, "validFrom");
    if (input.validUntil !== undefined && input.validUntil !== null) {
      parseDate(input.validUntil, "validUntil");
    }
    const created = await this.store.createCodeudor(contractId, {
      name: input.name.trim(),
      documentId: input.documentId ?? null,
      contact: input.contact ?? null,
      validFrom: input.validFrom,
      validUntil: input.validUntil ?? null,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "codeudor.created",
        entityType: "Codeudor",
        entityId: created.id,
        metadata: { contractId },
      }),
    );
    return created;
  }

  async listCodeudores(contractId: string, orgId: string) {
    await this.getContract(contractId, orgId);
    return this.store.listCodeudores(contractId);
  }

  async listExpiringPolicies(orgId: string, withinDays = 30) {
    const days = Number.isInteger(withinDays) && withinDays > 0 ? Math.min(withinDays, 365) : 30;
    const before = new Date(Date.now() + days * 86_400_000);
    return this.store.expiringCodeudores(orgId, before);
  }

  async listExpiringContracts(orgId: string, withinDays = 90) {
    const days = Number.isInteger(withinDays) && withinDays > 0 ? Math.min(withinDays, 365) : 90;
    const before = new Date(Date.now() + days * 86_400_000);
    const rows = await this.store.expiringContracts(orgId, before);
    const now = Date.now();
    return rows.map((row) => {
      const daysRemaining = Math.ceil((row.endDate.getTime() - now) / 86_400_000);
      return { ...row, daysRemaining, stage: renewalStage(daysRemaining) };
    });
  }

  async renewContract(
    orgId: string,
    actorId: string,
    contractId: string,
    input: { newEndDate: string; rentAmount?: number },
  ) {
    const contract = await this.getContract(contractId, orgId);
    if (contract.status === "TERMINATED") {
      throw new BadRequestException("Terminated contracts cannot be renewed.");
    }
    const newEnd = parseDate(input.newEndDate, "newEndDate");
    let rentAmountMinor: number | undefined;
    if (input.rentAmount !== undefined) {
      rentAmountMinor = toMinor(input.rentAmount);
    }
    try {
      validateRenewalTerms({
        currentEndDate: contract.endDate.toISOString(),
        newEndDate: newEnd.toISOString(),
        ...(rentAmountMinor === undefined ? {} : { rentAmountMinor }),
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid renewal.");
    }
    const updated = await this.store.renewContract(contractId, {
      endDate: newEnd,
      ...(rentAmountMinor === undefined ? {} : { rentAmountMinor }),
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "contract.renewed",
        entityType: "Contract",
        entityId: contractId,
        metadata: { newEndDate: newEnd.toISOString().slice(0, 10) },
      }),
    );
    return updated;
  }
}
