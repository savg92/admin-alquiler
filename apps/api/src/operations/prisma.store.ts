import { prisma } from "@admin-alquiler/database";
import type {
  AuditInput,
  InsuranceRow,
  MaintenanceRequestRow,
  OperationsStore,
  PurchaseRow,
  SupplierRow,
  WorkOrderRow,
} from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

const toMinor = (value: { toNumber(): number }): number => Math.round(value.toNumber() * 100);

type PrismaMaintenance = NonNullable<
  Awaited<ReturnType<typeof prisma.maintenanceRequest.findFirst>>
>;
type PrismaWorkOrder = NonNullable<Awaited<ReturnType<typeof prisma.workOrder.findFirst>>>;

export class PrismaOperationsStore implements OperationsStore {
  async findProperty(id: string, orgId: string): Promise<{ id: string } | null> {
    return prisma.property.findFirst({ where: { id, orgId }, select: { id: true } });
  }

  async findUnit(unitId: string): Promise<{ id: string; propertyId: string } | null> {
    return prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, propertyId: true },
    });
  }

  async createMaintenanceRequest(
    orgId: string,
    data: {
      propertyId: string;
      unitId: string | null;
      title: string;
      description: string;
      priority: string;
    },
  ): Promise<MaintenanceRequestRow> {
    const created = await prisma.maintenanceRequest.create({
      data: {
        orgId,
        propertyId: data.propertyId,
        unitId: data.unitId,
        title: data.title,
        description: data.description,
        priority: data.priority as PrismaMaintenance["priority"],
      },
    });
    return {
      id: created.id,
      propertyId: created.propertyId,
      unitId: created.unitId,
      title: created.title,
      description: created.description,
      priority: created.priority,
      status: created.status,
    };
  }

  async listMaintenanceRequests(
    orgId: string,
    propertyId?: string,
  ): Promise<MaintenanceRequestRow[]> {
    const rows = await prisma.maintenanceRequest.findMany({
      where: { orgId, ...(propertyId === undefined ? {} : { propertyId }) },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      propertyId: row.propertyId,
      unitId: row.unitId,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
    }));
  }

  async findMaintenanceRequest(id: string, orgId: string): Promise<MaintenanceRequestRow | null> {
    const row = await prisma.maintenanceRequest.findFirst({ where: { id, orgId } });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      propertyId: row.propertyId,
      unitId: row.unitId,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
    };
  }

  async setMaintenanceStatus(id: string, status: string): Promise<MaintenanceRequestRow> {
    const updated = await prisma.maintenanceRequest.update({
      where: { id },
      data: { status: status as PrismaMaintenance["status"] },
    });
    return {
      id: updated.id,
      propertyId: updated.propertyId,
      unitId: updated.unitId,
      title: updated.title,
      description: updated.description,
      priority: updated.priority,
      status: updated.status,
    };
  }

  async createWorkOrder(
    requestId: string,
    data: { supplierId: string | null; costMinor: number | null; currency: string | null },
  ): Promise<WorkOrderRow> {
    const created = await prisma.workOrder.create({
      data: {
        requestId,
        supplierId: data.supplierId,
        cost: data.costMinor === null ? null : data.costMinor / 100,
        currency: data.currency,
      },
    });
    return {
      id: created.id,
      requestId: created.requestId,
      supplierId: created.supplierId,
      status: created.status,
      costMinor: created.cost === null ? null : toMinor(created.cost),
      currency: created.currency,
    };
  }

  async listWorkOrders(requestId: string): Promise<WorkOrderRow[]> {
    const rows = await prisma.workOrder.findMany({
      where: { requestId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      requestId: row.requestId,
      supplierId: row.supplierId,
      status: row.status,
      costMinor: row.cost === null ? null : toMinor(row.cost),
      currency: row.currency,
    }));
  }

  async setWorkOrderStatus(
    id: string,
    data: { status?: string; costMinor?: number | null; currency?: string | null },
  ): Promise<WorkOrderRow> {
    const updated = await prisma.workOrder.update({
      where: { id },
      data: {
        ...(data.status === undefined ? {} : { status: data.status as PrismaWorkOrder["status"] }),
        ...(data.costMinor === undefined
          ? {}
          : { cost: data.costMinor === null ? null : data.costMinor / 100 }),
        ...(data.currency === undefined ? {} : { currency: data.currency }),
      },
    });
    return {
      id: updated.id,
      requestId: updated.requestId,
      supplierId: updated.supplierId,
      status: updated.status,
      costMinor: updated.cost === null ? null : toMinor(updated.cost),
      currency: updated.currency,
    };
  }

  async assignWorkOrderSupplier(id: string, supplierId: string): Promise<WorkOrderRow> {
    const updated = await prisma.workOrder.update({ where: { id }, data: { supplierId } });
    return {
      id: updated.id,
      requestId: updated.requestId,
      supplierId: updated.supplierId,
      status: updated.status,
      costMinor: updated.cost === null ? null : toMinor(updated.cost),
      currency: updated.currency,
    };
  }

  async createSupplier(
    orgId: string,
    data: {
      name: string;
      category: string;
      contact: string | null;
      taxId: string | null;
      address: string | null;
      notes: string | null;
    },
  ): Promise<SupplierRow> {
    const created = await prisma.supplier.create({
      data: {
        orgId,
        name: data.name,
        category: data.category,
        contact: data.contact,
        taxId: data.taxId,
        address: data.address,
        notes: data.notes,
      },
    });
    return {
      id: created.id,
      name: created.name,
      category: created.category,
      contact: created.contact,
      taxId: created.taxId,
      address: created.address,
      notes: created.notes,
    };
  }

  async listSuppliers(orgId: string): Promise<SupplierRow[]> {
    const rows = await prisma.supplier.findMany({ where: { orgId }, orderBy: { name: "asc" } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      contact: row.contact,
      taxId: row.taxId,
      address: row.address,
      notes: row.notes,
    }));
  }

  async findSupplier(id: string, orgId: string): Promise<SupplierRow | null> {
    const row = await prisma.supplier.findFirst({ where: { id, orgId } });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      contact: row.contact,
      taxId: row.taxId,
      address: row.address,
      notes: row.notes,
    };
  }

  async createPurchase(
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
  ): Promise<PurchaseRow> {
    const created = await prisma.purchase.create({
      data: {
        orgId,
        propertyId: data.propertyId,
        supplierId: data.supplierId,
        place: data.place,
        description: data.description,
        amount: data.amountMinor / 100,
        currency: data.currency,
        date: data.date,
        receiptRef: data.receiptRef,
        recordedBy: data.recordedBy,
      },
    });
    return {
      id: created.id,
      propertyId: created.propertyId,
      supplierId: created.supplierId,
      place: created.place,
      description: created.description,
      amountMinor: toMinor(created.amount),
      currency: created.currency,
      date: created.date,
      receiptRef: created.receiptRef,
    };
  }

  async listPurchases(orgId: string, propertyId?: string): Promise<PurchaseRow[]> {
    const rows = await prisma.purchase.findMany({
      where: { orgId, ...(propertyId === undefined ? {} : { propertyId }) },
      orderBy: { date: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      propertyId: row.propertyId,
      supplierId: row.supplierId,
      place: row.place,
      description: row.description,
      amountMinor: toMinor(row.amount),
      currency: row.currency,
      date: row.date,
      receiptRef: row.receiptRef,
    }));
  }

  async createInsurance(
    orgId: string,
    data: {
      propertyId: string | null;
      contractId: string | null;
      provider: string;
      policyRef: string;
      validFrom: Date;
      validUntil: Date;
    },
  ): Promise<InsuranceRow> {
    const created = await prisma.insurance.create({
      data: {
        orgId,
        propertyId: data.propertyId,
        contractId: data.contractId,
        provider: data.provider,
        policyRef: data.policyRef,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
      },
    });
    return {
      id: created.id,
      propertyId: created.propertyId,
      contractId: created.contractId,
      provider: created.provider,
      policyRef: created.policyRef,
      validFrom: created.validFrom,
      validUntil: created.validUntil,
    };
  }

  async listInsurance(orgId: string, propertyId?: string): Promise<InsuranceRow[]> {
    const rows = await prisma.insurance.findMany({
      where: { orgId, ...(propertyId === undefined ? {} : { propertyId }) },
      orderBy: { validUntil: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      propertyId: row.propertyId,
      contractId: row.contractId,
      provider: row.provider,
      policyRef: row.policyRef,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
    }));
  }

  async writeAuditEvent(event: AuditInput): Promise<void> {
    await prisma.auditEvent.create({
      data: {
        ...(event.orgId === undefined ? {} : { orgId: event.orgId }),
        ...(event.actorId === undefined ? {} : { actorId: event.actorId }),
        action: event.action,
        ...(event.entityType === undefined ? {} : { entityType: event.entityType }),
        ...(event.entityId === undefined ? {} : { entityId: event.entityId }),
        ...(event.metadata === undefined ? {} : { metadata: toJsonInput(event.metadata) }),
      },
    });
  }
}
