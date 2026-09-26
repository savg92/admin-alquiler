import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  canTransitionMaintenance,
  parseMaintenancePriority,
  parseMaintenanceStatus,
  validateMaintenanceText,
  type MaintenanceStatus,
} from "@admin-alquiler/domain";
import { OPERATIONS_STORE } from "./tokens";
import type { OperationsStore } from "./store";

const ISO_CURRENCIES = new Set([
  "COP",
  "USD",
  "EUR",
  "MXN",
  "PEN",
  "CLP",
  "ARS",
  "BRL",
  "GBP",
  "CAD",
]);

@Injectable()
export class MaintenanceService {
  constructor(@Inject(OPERATIONS_STORE) private readonly store: OperationsStore) {}

  async createRequest(
    orgId: string,
    actorId: string,
    input: {
      propertyId: string;
      unitId?: string | null;
      title: string;
      description: string;
      priority?: string;
    },
  ) {
    const property = await this.store.findProperty(input.propertyId, orgId);
    if (!property) {
      throw new NotFoundException("Property not found.");
    }
    let unitId: string | null = null;
    if (input.unitId !== undefined && input.unitId !== null) {
      const unit = await this.store.findUnit(input.unitId);
      if (!unit || unit.propertyId !== input.propertyId) {
        throw new NotFoundException("Unit not found for this property.");
      }
      unitId = unit.id;
    }
    try {
      validateMaintenanceText(input.title, input.description);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid request.");
    }
    let priority = "MEDIUM";
    if (input.priority !== undefined) {
      try {
        priority = parseMaintenancePriority(input.priority);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : "Invalid priority.");
      }
    }
    const created = await this.store.createMaintenanceRequest(orgId, {
      propertyId: property.id,
      unitId,
      title: input.title.trim(),
      description: input.description.trim(),
      priority,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "maintenance.request_created",
        entityType: "MaintenanceRequest",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listRequests(orgId: string, propertyId?: string) {
    if (propertyId !== undefined) {
      const property = await this.store.findProperty(propertyId, orgId);
      if (!property) {
        throw new NotFoundException("Property not found.");
      }
    }
    return this.store.listMaintenanceRequests(
      orgId,
      ...(propertyId === undefined ? [] : [propertyId]),
    );
  }

  async transitionRequest(orgId: string, actorId: string, id: string, to: string) {
    let status: MaintenanceStatus;
    try {
      status = parseMaintenanceStatus(to);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid status.");
    }
    const found = await this.store.findMaintenanceRequest(id, orgId);
    if (!found) {
      throw new NotFoundException("Maintenance request not found.");
    }
    const from = found.status as MaintenanceStatus;
    if (!canTransitionMaintenance(from, status)) {
      throw new BadRequestException(`Cannot transition from ${from} to ${status}.`);
    }
    const updated = await this.store.setMaintenanceStatus(id, status);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "maintenance.status_changed",
        entityType: "MaintenanceRequest",
        entityId: id,
        metadata: { from, to: status },
      }),
    );
    return updated;
  }

  async createWorkOrder(
    orgId: string,
    actorId: string,
    requestId: string,
    input: { supplierId?: string; cost?: number; currency?: string },
  ) {
    const found = await this.store.findMaintenanceRequest(requestId, orgId);
    if (!found) {
      throw new NotFoundException("Maintenance request not found.");
    }
    let supplierId: string | null = null;
    if (input.supplierId !== undefined) {
      const supplier = await this.store.findSupplier(input.supplierId, orgId);
      if (!supplier) {
        throw new NotFoundException("Supplier not found.");
      }
      supplierId = supplier.id;
    }
    let costMinor: number | null = null;
    let currency: string | null = null;
    if (input.cost !== undefined || input.currency !== undefined) {
      if (typeof input.cost !== "number" || !(input.cost > 0)) {
        throw new BadRequestException("cost must be a positive number when present.");
      }
      if (typeof input.currency !== "string" || !ISO_CURRENCIES.has(input.currency.toUpperCase())) {
        throw new BadRequestException("currency must be a supported ISO-4217 code.");
      }
      costMinor = Math.round(input.cost * 100);
      currency = input.currency.toUpperCase();
    }
    const created = await this.store.createWorkOrder(requestId, {
      supplierId,
      costMinor,
      currency,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "maintenance.work_order_created",
        entityType: "WorkOrder",
        entityId: created.id,
        metadata: { requestId },
      }),
    );
    return created;
  }

  async listWorkOrders(requestId: string, orgId: string) {
    const found = await this.store.findMaintenanceRequest(requestId, orgId);
    if (!found) {
      throw new NotFoundException("Maintenance request not found.");
    }
    return this.store.listWorkOrders(requestId);
  }

  async transitionWorkOrder(
    orgId: string,
    actorId: string,
    requestId: string,
    id: string,
    to: string,
  ) {
    const found = await this.store.findMaintenanceRequest(requestId, orgId);
    if (!found) {
      throw new NotFoundException("Maintenance request not found.");
    }
    const orders = await this.store.listWorkOrders(requestId);
    if (!orders.some((row) => row.id === id)) {
      throw new NotFoundException("Work order not found for this request.");
    }
    let status: MaintenanceStatus;
    try {
      status = parseMaintenanceStatus(to);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid status.");
    }
    const updated = await this.store.setWorkOrderStatus(id, { status });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "maintenance.work_order_status_changed",
        entityType: "WorkOrder",
        entityId: id,
        metadata: { to: status },
      }),
    );
    return updated;
  }
}
