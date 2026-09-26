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
  writeAuditEvent(event: AuditInput): Promise<void>;
}
