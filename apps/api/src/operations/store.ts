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
  writeAuditEvent(event: AuditInput): Promise<void>;
}
