import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  allocatePayment,
  applyIndexIncrease,
  buildAuditEvent,
  buildRentSchedule,
  chargePaymentStatus,
  consumptionBetween,
  depositRemaining,
  detectReadingAnomaly,
  periodDueDate,
  quoteIndemnity,
  renewalStage,
  validateCodeudorTerms,
  validateContractTerms,
  validateDepositMovement,
  validateIndexValue,
  validateMeterReading,
  validateRenewalTerms,
  validateTermination,
  type IndemnityRuleId,
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

  async terminateContract(
    orgId: string,
    actorId: string,
    contractId: string,
    input: { noticeDate: string; effectiveDate: string; cause: string; ruleId?: IndemnityRuleId },
  ) {
    const contract = await this.getContract(contractId, orgId);
    if (contract.status === "TERMINATED") {
      throw new BadRequestException("Contract is already terminated.");
    }
    try {
      validateTermination(input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid termination.",
      );
    }
    const noticeDate = parseDate(input.noticeDate, "noticeDate");
    const effectiveDate = parseDate(input.effectiveDate, "effectiveDate");
    const ruleId: IndemnityRuleId =
      input.ruleId === "GENERIC_NO_INDEMNITY"
        ? "GENERIC_NO_INDEMNITY"
        : "CO_EARLY_TERMINATION_DEFAULT";
    const monthsRemaining = Math.max(
      0,
      (contract.endDate.getFullYear() - effectiveDate.getFullYear()) * 12 +
        (contract.endDate.getMonth() - effectiveDate.getMonth()),
    );
    const quote = quoteIndemnity(ruleId, contract.rentAmountMinor, monthsRemaining);
    let indemnityRef: string | null = null;
    if (quote.amountMinor > 0) {
      const period = `${effectiveDate.getUTCFullYear()}-${String(effectiveDate.getUTCMonth() + 1).padStart(2, "0")}`;
      const charge = await this.store.createCharge({
        orgId,
        contractId,
        type: "FINE",
        description: `Indemnización terminación anticipada (${quote.ruleId})`,
        amountMinor: quote.amountMinor,
        currency: contract.currency,
        dueDate: effectiveDate,
        period: `${period}-indemnity`,
      });
      indemnityRef = charge.id;
    }
    const termination = await this.store.saveTermination(contractId, {
      noticeDate,
      effectiveDate,
      cause: input.cause.trim(),
      indemnityRef,
    });
    await this.store.markContractTerminated(contractId);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "contract.terminated",
        entityType: "Contract",
        entityId: contractId,
        metadata: { ruleId, indemnityMinor: quote.amountMinor, indemnityRef },
      }),
    );
    return { termination, indemnity: quote, indemnityRef };
  }

  async getTermination(contractId: string, orgId: string) {
    await this.getContract(contractId, orgId);
    return this.store.getTermination(contractId);
  }

  async getSchedule(contractId: string, orgId: string, from: string, months: number) {
    const contract = await this.getContract(contractId, orgId);
    try {
      return buildRentSchedule(from, months, contract.rentAmountMinor);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid schedule.");
    }
  }

  async recordRentIndex(
    orgId: string,
    actorId: string,
    input: { country: string; period: string; value: number; source: string },
  ) {
    const country = input.country.toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new BadRequestException("country must be an ISO 3166-1 alpha-2 code.");
    }
    try {
      periodDueDate(input.period);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid period.");
    }
    try {
      validateIndexValue(input.value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid index.");
    }
    if (input.source !== "PROVIDER" && input.source !== "MANUAL") {
      throw new BadRequestException('source must be "PROVIDER" or "MANUAL".');
    }
    const saved = await this.store.upsertRentIndex({
      country,
      period: input.period,
      value: input.value,
      source: input.source,
      fetchedBy: actorId,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "rent_index.recorded",
        entityType: "RentIncreaseIndex",
        entityId: saved.id,
        metadata: { country, period: input.period, source: input.source },
      }),
    );
    return saved;
  }

  async getRentIndex(country: string, period: string) {
    const found = await this.store.findRentIndex(country.toUpperCase(), period);
    if (!found) {
      throw new NotFoundException("Index not found for country/period.");
    }
    return found;
  }

  async applyRentIncrease(
    orgId: string,
    actorId: string,
    contractId: string,
    input: { indexPeriod: string; country?: string; capPct?: number },
  ) {
    const contract = await this.getContract(contractId, orgId);
    if (contract.status === "TERMINATED") {
      throw new BadRequestException("Terminated contracts cannot be increased.");
    }
    const profile = await this.store.findOrgProfile(orgId);
    void profile;
    const country = (input.country ?? "CO").toUpperCase();
    const index = await this.store.findRentIndex(country, input.indexPeriod);
    if (!index) {
      throw new NotFoundException("Index not found for country/period.");
    }
    if (input.capPct !== undefined) {
      try {
        validateIndexValue(input.capPct);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : "Invalid cap.");
      }
    }
    const newRentMinor = applyIndexIncrease(
      contract.rentAmountMinor,
      index.value,
      ...(input.capPct === undefined ? [] : [input.capPct]),
    );
    const oldRentMinor = contract.rentAmountMinor;
    const updated = await this.store.updateContractRent(contractId, newRentMinor);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "contract.rent_increased",
        entityType: "Contract",
        entityId: contractId,
        metadata: {
          indexPeriod: input.indexPeriod,
          indexPct: index.value,
          oldRentMinor,
          newRentMinor,
        },
      }),
    );
    return { contract: updated, indexPct: index.value, oldRentMinor, newRentMinor };
  }

  async recordMeterReading(
    orgId: string,
    actorId: string,
    unitId: string,
    input: { utility: string; value: number; readingDate: string; photoRef?: string | null },
  ) {
    const unit = await this.store.findUnit(unitId, orgId);
    if (!unit) {
      throw new NotFoundException("Unit not found.");
    }
    try {
      validateMeterReading(input);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid reading.");
    }
    const readingDate = parseDate(input.readingDate, "readingDate");
    const previous = await this.store.lastMeterReading(unitId, input.utility.trim());
    if (previous && readingDate < previous.readingDate) {
      throw new BadRequestException("Reading date must be on or after the previous reading.");
    }
    const verdict = detectReadingAnomaly(previous?.value ?? null, input.value);
    const created = await this.store.createMeterReading(unitId, {
      utility: input.utility.trim(),
      value: input.value,
      readingDate: input.readingDate,
      ...(input.photoRef === undefined || input.photoRef === null
        ? {}
        : { photoRef: input.photoRef }),
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "meter.reading_recorded",
        entityType: "MeterReading",
        entityId: created.id,
        metadata: { unitId, utility: input.utility.trim(), anomaly: verdict.anomaly },
      }),
    );
    return { reading: created, previousValue: previous?.value ?? null, anomaly: verdict };
  }

  async listMeterReadings(unitId: string, orgId: string, utility?: string) {
    const unit = await this.store.findUnit(unitId, orgId);
    if (!unit) {
      throw new NotFoundException("Unit not found.");
    }
    return this.store.listMeterReadings(unitId, utility);
  }

  async chargeFromReading(
    orgId: string,
    actorId: string,
    contractId: string,
    input: { readingId: string; ratePerUnit: number; period: string; confirmAnomaly?: boolean },
  ) {
    const contract = await this.getContract(contractId, orgId);
    const reading = await this.store.findMeterReading(input.readingId);
    if (!reading || reading.propertyId !== contract.propertyId) {
      throw new NotFoundException("Reading not found for this contract.");
    }
    if (!(input.ratePerUnit > 0) || !Number.isFinite(input.ratePerUnit)) {
      throw new BadRequestException("ratePerUnit must be a positive number.");
    }
    let dueDate: Date;
    try {
      dueDate = periodDueDate(input.period);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid period.");
    }
    const history = await this.store.listMeterReadings(reading.unitId, reading.utility);
    const idx = history.findIndex((row) => row.id === reading.id);
    const prev = idx > 0 ? history[idx - 1] : undefined;
    if (!prev) {
      throw new BadRequestException("A previous reading is required to compute consumption.");
    }
    let consumption: number;
    try {
      consumption = consumptionBetween(prev.value, reading.value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid reading.");
    }
    if (reading.anomaly && input.confirmAnomaly !== true) {
      throw new BadRequestException("Reading is flagged anomalous: confirm explicitly to charge.");
    }
    const amountMinor = Math.round(consumption * input.ratePerUnit * 100);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new BadRequestException("Computed charge amount must be positive.");
    }
    const charge = await this.store.createCharge({
      orgId,
      contractId,
      type: "UTILITY",
      description: `${reading.utility} ${consumption} unid. → ${input.period}`,
      amountMinor,
      currency: contract.currency,
      dueDate,
      period: input.period,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "charge.generated",
        entityType: "Charge",
        entityId: charge.id,
        metadata: { period: input.period, readingId: reading.id, consumption },
      }),
    );
    return { charge, consumption };
  }

  async recordDeposit(orgId: string, actorId: string, contractId: string, held: number) {
    const contract = await this.getContract(contractId, orgId);
    const heldMinor = toMinor(held);
    const created = await this.store.createDeposit(contractId, heldMinor, contract.currency);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "deposit.recorded",
        entityType: "Deposit",
        entityId: created.id,
        metadata: { contractId, heldMinor },
      }),
    );
    return { ...created, remainingMinor: depositRemaining(created) };
  }

  async listDeposits(contractId: string, orgId: string) {
    await this.getContract(contractId, orgId);
    const rows = await this.store.listDeposits(contractId);
    return rows.map((row) => ({ ...row, remainingMinor: depositRemaining(row) }));
  }

  async moveDeposit(
    orgId: string,
    actorId: string,
    depositId: string,
    kind: "deduct" | "return",
    amount: number,
  ) {
    const found = await this.store.findDeposit(depositId, orgId);
    if (!found) {
      throw new NotFoundException("Deposit not found.");
    }
    const amountMinor = toMinor(amount);
    try {
      validateDepositMovement(found, amountMinor);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid movement.");
    }
    const updated = await this.store.adjustDeposit(
      depositId,
      kind === "deduct" ? found.deductedMinor + amountMinor : found.deductedMinor,
      kind === "return" ? found.returnedMinor + amountMinor : found.returnedMinor,
    );
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: kind === "deduct" ? "deposit.deducted" : "deposit.returned",
        entityType: "Deposit",
        entityId: depositId,
        metadata: { amountMinor },
      }),
    );
    return { ...updated, remainingMinor: depositRemaining(updated) };
  }
}
