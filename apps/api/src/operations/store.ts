export interface MaintenanceRequestRow {
  id: string;
  propertyId: string;
  unitId: string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
}

export interface WorkOrderRow {
  id: string;
  requestId: string;
  supplierId: string | null;
  status: string;
  costMinor: number | null;
  currency: string | null;
}

export interface SupplierRow {
  id: string;
  name: string;
  category: string;
  contact: string | null;
  taxId: string | null;
  address: string | null;
  notes: string | null;
}

export interface PurchaseRow {
  id: string;
  propertyId: string;
  supplierId: string | null;
  place: string | null;
  description: string;
  amountMinor: number;
  currency: string;
  date: Date;
  receiptRef: string | null;
}

export interface InsuranceRow {
  id: string;
  propertyId: string | null;
  contractId: string | null;
  provider: string;
  policyRef: string;
  validFrom: Date;
  validUntil: Date;
}

export interface CaseRow {
  id: string;
  propertyId: string;
  reporter: string;
  subject: string;
  body: string;
  status: string;
}

export interface TaxRecordRow {
  id: string;
  country: string;
  label: string;
  dueDate: Date;
  receiptRef: string | null;
}

export interface HouseRuleRow {
  id: string;
  propertyId: string;
  version: number;
  body: string;
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface OperationsStore {
  findProperty(id: string, orgId: string): Promise<{ id: string } | null>;
  findUnit(unitId: string): Promise<{ id: string; propertyId: string } | null>;
  createMaintenanceRequest(
    orgId: string,
    data: {
      propertyId: string;
      unitId: string | null;
      title: string;
      description: string;
      priority: string;
    },
  ): Promise<MaintenanceRequestRow>;
  listMaintenanceRequests(orgId: string, propertyId?: string): Promise<MaintenanceRequestRow[]>;
  findMaintenanceRequest(id: string, orgId: string): Promise<MaintenanceRequestRow | null>;
  setMaintenanceStatus(id: string, status: string): Promise<MaintenanceRequestRow>;
  createWorkOrder(
    requestId: string,
    data: { supplierId: string | null; costMinor: number | null; currency: string | null },
  ): Promise<WorkOrderRow>;
  listWorkOrders(requestId: string): Promise<WorkOrderRow[]>;
  setWorkOrderStatus(
    id: string,
    data: { status?: string; costMinor?: number | null; currency?: string | null },
  ): Promise<WorkOrderRow>;
  assignWorkOrderSupplier(id: string, supplierId: string): Promise<WorkOrderRow>;
  createSupplier(
    orgId: string,
    data: {
      name: string;
      category: string;
      contact: string | null;
      taxId: string | null;
      address: string | null;
      notes: string | null;
    },
  ): Promise<SupplierRow>;
  listSuppliers(orgId: string): Promise<SupplierRow[]>;
  findSupplier(id: string, orgId: string): Promise<SupplierRow | null>;
  createPurchase(
    orgId: string,
    data: {
      propertyId: string;
      supplierId: string | null;
      place: string | null;
      description: string;
      amountMinor: number;
      currency: string;
      date: Date;
      receiptRef: string | null;
      recordedBy: string;
    },
  ): Promise<PurchaseRow>;
  listPurchases(orgId: string, propertyId?: string): Promise<PurchaseRow[]>;
  createInsurance(
    orgId: string,
    data: {
      propertyId: string | null;
      contractId: string | null;
      provider: string;
      policyRef: string;
      validFrom: Date;
      validUntil: Date;
    },
  ): Promise<InsuranceRow>;
  listInsurance(orgId: string, propertyId?: string): Promise<InsuranceRow[]>;
  createComplaint(
    orgId: string,
    data: { propertyId: string; reporter: string; subject: string; body: string },
  ): Promise<CaseRow>;
  listComplaints(orgId: string, propertyId?: string): Promise<CaseRow[]>;
  findComplaint(id: string, orgId: string): Promise<CaseRow | null>;
  setComplaintStatus(id: string, status: string): Promise<CaseRow>;
  createClaim(
    orgId: string,
    data: { propertyId: string; subject: string; body: string },
  ): Promise<CaseRow>;
  listClaims(orgId: string, propertyId?: string): Promise<CaseRow[]>;
  findClaim(id: string, orgId: string): Promise<CaseRow | null>;
  setClaimStatus(id: string, status: string): Promise<CaseRow>;
  createTaxRecord(
    orgId: string,
    data: { country: string; label: string; dueDate: Date; receiptRef: string | null },
  ): Promise<TaxRecordRow>;
  listTaxRecords(orgId: string, before?: Date): Promise<TaxRecordRow[]>;
  createHouseRule(propertyId: string, body: string): Promise<HouseRuleRow>;
  listHouseRules(propertyId: string): Promise<HouseRuleRow[]>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
