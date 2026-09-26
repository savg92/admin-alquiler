import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  validateInsurance,
  validatePurchase,
  validateSupplierCategory,
  validateSupplierName,
} from "@admin-alquiler/domain";
import { RentalService } from "../rental/rental.service";
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

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new BadRequestException(`${field} must be 1-${max} characters when present.`);
  }
  return value.trim();
}

@Injectable()
export class DirectoryService {
  constructor(
    @Inject(OPERATIONS_STORE) private readonly store: OperationsStore,
    private readonly rental: RentalService,
  ) {}

  async createSupplier(
    orgId: string,
    actorId: string,
    input: {
      name: string;
      category: string;
      contact?: string | null;
      taxId?: string | null;
      address?: string | null;
      notes?: string | null;
    },
  ) {
    let name: string;
    let category: string;
    try {
      name = validateSupplierName(input.name);
      category = validateSupplierCategory(input.category);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid supplier.");
    }
    const created = await this.store.createSupplier(orgId, {
      name,
      category,
      contact: optionalText(input.contact, "contact", 200),
      taxId: optionalText(input.taxId, "taxId", 40),
      address: optionalText(input.address, "address", 200),
      notes: optionalText(input.notes, "notes", 1000),
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "supplier.created",
        entityType: "Supplier",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listSuppliers(orgId: string) {
    return this.store.listSuppliers(orgId);
  }

  async createPurchase(
    orgId: string,
    actorId: string,
    input: {
      propertyId: string;
      supplierId?: string;
      place?: string | null;
      description: string;
      amount: number;
      currency: string;
      date: string;
      receiptRef?: string | null;
    },
  ) {
    const property = await this.store.findProperty(input.propertyId, orgId);
    if (!property) {
      throw new NotFoundException("Property not found.");
    }
    let supplierId: string | null = null;
    if (input.supplierId !== undefined) {
      const supplier = await this.store.findSupplier(input.supplierId, orgId);
      if (!supplier) {
        throw new NotFoundException("Supplier not found.");
      }
      supplierId = supplier.id;
    }
    let amountMinor: number;
    try {
      amountMinor = validatePurchase({
        description: input.description,
        amount: input.amount,
        currency: input.currency,
        date: input.date,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid purchase.");
    }
    if (!ISO_CURRENCIES.has(input.currency.toUpperCase())) {
      throw new BadRequestException(`Unsupported currency "${input.currency}".`);
    }
    const created = await this.store.createPurchase(orgId, {
      propertyId: property.id,
      supplierId,
      place: optionalText(input.place, "place", 200),
      description: input.description.trim(),
      amountMinor,
      currency: input.currency.toUpperCase(),
      date: new Date(input.date),
      receiptRef: optionalText(input.receiptRef, "receiptRef", 120),
      recordedBy: actorId,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "purchase.recorded",
        entityType: "Purchase",
        entityId: created.id,
        metadata: { propertyId: property.id, amountMinor },
      }),
    );
    return created;
  }

  async listPurchases(orgId: string, propertyId?: string) {
    if (propertyId !== undefined) {
      const property = await this.store.findProperty(propertyId, orgId);
      if (!property) {
        throw new NotFoundException("Property not found.");
      }
    }
    return this.store.listPurchases(orgId, ...(propertyId === undefined ? [] : [propertyId]));
  }

  async createInsurance(
    orgId: string,
    actorId: string,
    input: {
      propertyId?: string;
      contractId?: string;
      provider: string;
      policyRef: string;
      validFrom: string;
      validUntil: string;
    },
  ) {
    let propertyId: string | null = null;
    if (input.propertyId !== undefined) {
      const property = await this.store.findProperty(input.propertyId, orgId);
      if (!property) {
        throw new NotFoundException("Property not found.");
      }
      propertyId = property.id;
    }
    let contractId: string | null = null;
    if (input.contractId !== undefined) {
      await this.rental.getContract(input.contractId, orgId);
      contractId = input.contractId;
    }
    try {
      validateInsurance({
        provider: input.provider,
        policyRef: input.policyRef,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid insurance.");
    }
    const created = await this.store.createInsurance(orgId, {
      propertyId,
      contractId,
      provider: input.provider.trim(),
      policyRef: input.policyRef.trim(),
      validFrom: new Date(input.validFrom),
      validUntil: new Date(input.validUntil),
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "insurance.recorded",
        entityType: "Insurance",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listInsurance(orgId: string, propertyId?: string) {
    return this.store.listInsurance(orgId, ...(propertyId === undefined ? [] : [propertyId]));
  }

  async assignSupplierToWorkOrder(
    orgId: string,
    actorId: string,
    requestId: string,
    orderId: string,
    supplierId: string,
  ) {
    const request = await this.store.findMaintenanceRequest(requestId, orgId);
    if (!request) {
      throw new NotFoundException("Maintenance request not found.");
    }
    const supplier = await this.store.findSupplier(supplierId, orgId);
    if (!supplier) {
      throw new NotFoundException("Supplier not found.");
    }
    const orders = await this.store.listWorkOrders(requestId);
    if (!orders.some((row) => row.id === orderId)) {
      throw new NotFoundException("Work order not found for this request.");
    }
    const updated = await this.store.assignWorkOrderSupplier(orderId, supplier.id);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "maintenance.work_order_assigned",
        entityType: "WorkOrder",
        entityId: orderId,
        metadata: { supplierId: supplier.id },
      }),
    );
    return updated;
  }
}
