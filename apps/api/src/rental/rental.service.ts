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
  validateContractTerms,
} from "@admin-alquiler/domain";
import { RENTAL_STORE } from "./tokens";
import type { ChargeRow, ContractRow, RentalStore } from "./store";

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
}
