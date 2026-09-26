export interface ContractInput {
  propertyId: string;
  tenantId: string;
  number: string;
  startDate: string;
  endDate: string;
  rentAmountMinor: number;
  currency: string;
}

export interface ContractRow {
  id: string;
  orgId: string;
  propertyId: string;
  tenantId: string;
  number: string;
  status: string;
  startDate: Date;
  endDate: Date;
  rentAmountMinor: number;
  currency: string;
}

export interface ChargeRow {
  id: string;
  contractId: string;
  type: string;
  description: string;
  amountMinor: number;
  currency: string;
  dueDate: Date;
  period: string;
  status: string;
}

export interface ChargeBalanceInput {
  id: string;
  balanceMinor: number;
  dueDate: string;
}

export interface PaymentInput {
  amountMinor: number;
  method: string;
  reference?: string | undefined;
  paidAt: string;
}

export interface ReceiptRow {
  id: string;
  number: string;
  locale: string;
}

export interface CodeudorRow {
  id: string;
  contractId: string;
  name: string;
  documentId: string | null;
  contact: string | null;
  validFrom: Date;
  validUntil: Date | null;
}

export interface CodeudorInput {
  name: string;
  documentId?: string | null;
  contact?: string | null;
  validFrom: string;
  validUntil?: string | null;
}

export interface TerminationRow {
  id: string;
  contractId: string;
  noticeDate: Date;
  effectiveDate: Date;
  cause: string;
  indemnityRef: string | null;
}

export interface RentIndexRow {
  id: string;
  country: string;
  period: string;
  value: number;
  source: string;
}

export interface MeterReadingRow {
  id: string;
  unitId: string;
  utility: string;
  value: number;
  readingDate: Date;
  photoRef: string | null;
  anomaly: boolean;
}

export interface MeterReadingInput {
  utility: string;
  value: number;
  readingDate: string;
  photoRef?: string | null;
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface RentalStore {
  findOrgProfile(orgId: string): Promise<{ currency: string; locale: string } | null>;
  findProperty(propertyId: string, orgId: string): Promise<{ id: string } | null>;
  findTenant(tenantId: string, orgId: string): Promise<{ id: string } | null>;
  isContractNumberTaken(orgId: string, number: string): Promise<boolean>;
  createContract(orgId: string, input: ContractInput): Promise<ContractRow>;
  listContracts(orgId: string): Promise<ContractRow[]>;
  findContract(id: string, orgId: string): Promise<ContractRow | null>;
  findCharge(contractId: string, period: string, type: string): Promise<ChargeRow | null>;
  createCharge(data: {
    orgId: string;
    contractId: string;
    type: string;
    description: string;
    amountMinor: number;
    currency: string;
    dueDate: Date;
    period: string;
  }): Promise<ChargeRow>;
  pendingChargeBalances(contractId: string): Promise<ChargeBalanceInput[]>;
  createPayment(data: {
    orgId: string;
    contractId: string;
    amountMinor: number;
    currency: string;
    method: string;
    reference: string | null;
    paidAt: Date;
  }): Promise<{ id: string }>;
  createAllocation(paymentId: string, chargeId: string, amountMinor: number): Promise<void>;
  updateChargeStatus(chargeId: string, status: string): Promise<void>;
  createReceipt(paymentId: string, number: string, locale: string): Promise<ReceiptRow>;
  findReceipt(id: string, orgId: string): Promise<(ReceiptRow & { paymentId: string }) | null>;
  createCodeudor(contractId: string, input: CodeudorInput): Promise<CodeudorRow>;
  listCodeudores(contractId: string): Promise<CodeudorRow[]>;
  expiringCodeudores(
    orgId: string,
    before: Date,
  ): Promise<(CodeudorRow & { contractNumber: string })[]>;
  expiringContracts(orgId: string, before: Date): Promise<ContractRow[]>;
  renewContract(
    id: string,
    data: { endDate: Date; rentAmountMinor?: number },
  ): Promise<ContractRow>;
  getTermination(contractId: string): Promise<TerminationRow | null>;
  saveTermination(
    contractId: string,
    data: { noticeDate: Date; effectiveDate: Date; cause: string; indemnityRef: string | null },
  ): Promise<TerminationRow>;
  markContractTerminated(id: string): Promise<ContractRow>;
  upsertRentIndex(data: {
    country: string;
    period: string;
    value: number;
    source: string;
    fetchedBy: string | null;
  }): Promise<RentIndexRow>;
  findRentIndex(country: string, period: string): Promise<RentIndexRow | null>;
  updateContractRent(id: string, rentAmountMinor: number): Promise<ContractRow>;
  findUnit(unitId: string, orgId: string): Promise<{ id: string; propertyId: string } | null>;
  lastMeterReading(unitId: string, utility: string): Promise<MeterReadingRow | null>;
  createMeterReading(unitId: string, input: MeterReadingInput): Promise<MeterReadingRow>;
  listMeterReadings(unitId: string, utility?: string): Promise<MeterReadingRow[]>;
  findMeterReading(id: string): Promise<(MeterReadingRow & { propertyId: string }) | null>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
