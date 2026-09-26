import { prisma } from "@admin-alquiler/database";
import type {
  AuditInput,
  ChargeBalanceInput,
  ChargeRow,
  CodeudorInput,
  CodeudorRow,
  ContractInput,
  ContractRow,
  RentalStore,
} from "./store";

type PrismaCharge = NonNullable<Awaited<ReturnType<typeof prisma.charge.findFirst>>>;
type PrismaPayment = NonNullable<Awaited<ReturnType<typeof prisma.payment.findFirst>>>;
type PrismaContract = NonNullable<Awaited<ReturnType<typeof prisma.contract.findFirst>>>;

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

const toMinor = (value: { toNumber(): number }): number => Math.round(value.toNumber() * 100);

export class PrismaRentalStore implements RentalStore {
  async findOrgProfile(orgId: string): Promise<{ currency: string; locale: string } | null> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { currency: true, locale: true },
    });
    return org;
  }

  async findProperty(propertyId: string, orgId: string): Promise<{ id: string } | null> {
    return prisma.property.findFirst({ where: { id: propertyId, orgId }, select: { id: true } });
  }

  async findTenant(tenantId: string, orgId: string): Promise<{ id: string } | null> {
    return prisma.tenant.findFirst({ where: { id: tenantId, orgId }, select: { id: true } });
  }

  async isContractNumberTaken(orgId: string, number: string): Promise<boolean> {
    const found = await prisma.contract.findUnique({
      where: { orgId_number: { orgId, number } },
      select: { id: true },
    });
    return found !== null;
  }

  async createContract(orgId: string, input: ContractInput): Promise<ContractRow> {
    const created = await prisma.contract.create({
      data: {
        orgId,
        propertyId: input.propertyId,
        tenantId: input.tenantId,
        number: input.number,
        status: "ACTIVE" as PrismaContract["status"],
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        rentAmount: input.rentAmountMinor / 100,
        currency: input.currency,
      },
    });
    return {
      id: created.id,
      orgId: created.orgId,
      propertyId: created.propertyId,
      tenantId: created.tenantId,
      number: created.number,
      status: created.status,
      startDate: created.startDate,
      endDate: created.endDate,
      rentAmountMinor: toMinor(created.rentAmount),
      currency: created.currency,
    };
  }

  async listContracts(orgId: string): Promise<ContractRow[]> {
    const rows = await prisma.contract.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      propertyId: row.propertyId,
      tenantId: row.tenantId,
      number: row.number,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      rentAmountMinor: toMinor(row.rentAmount),
      currency: row.currency,
    }));
  }

  async findContract(id: string, orgId: string): Promise<ContractRow | null> {
    const row = await prisma.contract.findFirst({ where: { id, orgId } });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      orgId: row.orgId,
      propertyId: row.propertyId,
      tenantId: row.tenantId,
      number: row.number,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      rentAmountMinor: toMinor(row.rentAmount),
      currency: row.currency,
    };
  }

  async findCharge(contractId: string, period: string, type: string): Promise<ChargeRow | null> {
    const row = await prisma.charge.findFirst({
      where: { contractId, period, type: type as PrismaCharge["type"] },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      contractId: row.contractId,
      type: row.type,
      description: row.description,
      amountMinor: toMinor(row.amount),
      currency: row.currency,
      dueDate: row.dueDate,
      period: row.period,
      status: row.status,
    };
  }

  async createCharge(data: {
    orgId: string;
    contractId: string;
    type: string;
    description: string;
    amountMinor: number;
    currency: string;
    dueDate: Date;
    period: string;
  }): Promise<ChargeRow> {
    try {
      const created = await prisma.charge.create({
        data: {
          orgId: data.orgId,
          contractId: data.contractId,
          type: data.type as PrismaCharge["type"],
          description: data.description,
          amount: data.amountMinor / 100,
          currency: data.currency,
          dueDate: data.dueDate,
          period: data.period,
        },
      });
      return {
        id: created.id,
        contractId: created.contractId,
        type: created.type,
        description: created.description,
        amountMinor: toMinor(created.amount),
        currency: created.currency,
        dueDate: created.dueDate,
        period: created.period,
        status: created.status,
      };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.findCharge(data.contractId, data.period, data.type);
      if (!existing) {
        throw error;
      }
      return existing;
    }
  }

  async pendingChargeBalances(contractId: string): Promise<ChargeBalanceInput[]> {
    const rows = await prisma.charge.findMany({
      where: { contractId, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        allocations: { select: { amount: true } },
      },
      orderBy: { dueDate: "asc" },
    });
    return rows.map((row) => {
      const paidMinor = row.allocations.reduce((total, item) => total + toMinor(item.amount), 0);
      return {
        id: row.id,
        balanceMinor: toMinor(row.amount) - paidMinor,
        dueDate: row.dueDate.toISOString().slice(0, 10),
      };
    });
  }

  async createPayment(data: {
    orgId: string;
    contractId: string;
    amountMinor: number;
    currency: string;
    method: string;
    reference: string | null;
    paidAt: Date;
  }): Promise<{ id: string }> {
    const created = await prisma.payment.create({
      data: {
        orgId: data.orgId,
        contractId: data.contractId,
        amount: data.amountMinor / 100,
        currency: data.currency,
        method: data.method as PrismaPayment["method"],
        reference: data.reference,
        paidAt: data.paidAt,
      },
      select: { id: true },
    });
    return created;
  }

  async createAllocation(paymentId: string, chargeId: string, amountMinor: number): Promise<void> {
    await prisma.allocation.create({
      data: { paymentId, chargeId, amount: amountMinor / 100 },
    });
  }

  async updateChargeStatus(chargeId: string, status: string): Promise<void> {
    await prisma.charge.update({
      where: { id: chargeId },
      data: { status: status as PrismaCharge["status"] },
    });
  }

  async createReceipt(
    paymentId: string,
    number: string,
    locale: string,
  ): Promise<{ id: string; number: string; locale: string }> {
    const created = await prisma.receipt.create({
      data: { paymentId, number, locale },
      select: { id: true, number: true, locale: true },
    });
    return created;
  }

  async findReceipt(
    id: string,
    orgId: string,
  ): Promise<{ id: string; number: string; locale: string; paymentId: string } | null> {
    const row = await prisma.receipt.findFirst({
      where: { id, payment: { orgId } },
      select: { id: true, number: true, locale: true, paymentId: true },
    });
    return row;
  }

  async createCodeudor(contractId: string, input: CodeudorInput): Promise<CodeudorRow> {
    const created = await prisma.codeudor.create({
      data: {
        contractId,
        name: input.name,
        documentId: input.documentId ?? null,
        contact: input.contact ?? null,
        validFrom: new Date(input.validFrom),
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      },
    });
    return {
      id: created.id,
      contractId: created.contractId,
      name: created.name,
      documentId: created.documentId,
      contact: created.contact,
      validFrom: created.validFrom,
      validUntil: created.validUntil,
    };
  }

  async listCodeudores(contractId: string): Promise<CodeudorRow[]> {
    const rows = await prisma.codeudor.findMany({
      where: { contractId },
      orderBy: { validFrom: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      contractId: row.contractId,
      name: row.name,
      documentId: row.documentId,
      contact: row.contact,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
    }));
  }

  async expiringCodeudores(
    orgId: string,
    before: Date,
  ): Promise<(CodeudorRow & { contractNumber: string })[]> {
    const now = new Date();
    const rows = await prisma.codeudor.findMany({
      where: {
        contract: { orgId },
        validUntil: { gte: now, lte: before },
      },
      include: { contract: { select: { number: true } } },
      orderBy: { validUntil: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      contractId: row.contractId,
      name: row.name,
      documentId: row.documentId,
      contact: row.contact,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      contractNumber: row.contract.number,
    }));
  }

  async expiringContracts(orgId: string, before: Date): Promise<ContractRow[]> {
    const rows = await prisma.contract.findMany({
      where: { orgId, status: "ACTIVE", endDate: { gte: new Date(), lte: before } },
      orderBy: { endDate: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      propertyId: row.propertyId,
      tenantId: row.tenantId,
      number: row.number,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      rentAmountMinor: toMinor(row.rentAmount),
      currency: row.currency,
    }));
  }

  async renewContract(
    id: string,
    data: { endDate: Date; rentAmountMinor?: number },
  ): Promise<ContractRow> {
    const updated = await prisma.contract.update({
      where: { id },
      data: {
        endDate: data.endDate,
        ...(data.rentAmountMinor === undefined ? {} : { rentAmount: data.rentAmountMinor / 100 }),
        status: "ACTIVE",
      },
    });
    return {
      id: updated.id,
      orgId: updated.orgId,
      propertyId: updated.propertyId,
      tenantId: updated.tenantId,
      number: updated.number,
      status: updated.status,
      startDate: updated.startDate,
      endDate: updated.endDate,
      rentAmountMinor: toMinor(updated.rentAmount),
      currency: updated.currency,
    };
  }

  async getTermination(contractId: string) {
    const row = await prisma.contractTermination.findUnique({ where: { contractId } });
    return row;
  }

  async saveTermination(
    contractId: string,
    data: { noticeDate: Date; effectiveDate: Date; cause: string; indemnityRef: string | null },
  ) {
    const saved = await prisma.contractTermination.upsert({
      where: { contractId },
      create: { contractId, ...data },
      update: { ...data },
    });
    return saved;
  }

  async markContractTerminated(id: string): Promise<ContractRow> {
    const updated = await prisma.contract.update({
      where: { id },
      data: { status: "TERMINATED" },
    });
    return {
      id: updated.id,
      orgId: updated.orgId,
      propertyId: updated.propertyId,
      tenantId: updated.tenantId,
      number: updated.number,
      status: updated.status,
      startDate: updated.startDate,
      endDate: updated.endDate,
      rentAmountMinor: toMinor(updated.rentAmount),
      currency: updated.currency,
    };
  }

  async upsertRentIndex(data: {
    country: string;
    period: string;
    value: number;
    source: string;
    fetchedBy: string | null;
  }) {
    const saved = await prisma.rentIncreaseIndex.upsert({
      where: { country_period: { country: data.country, period: data.period } },
      create: {
        country: data.country,
        period: data.period,
        value: data.value,
        source: data.source as "PROVIDER" | "MANUAL",
        fetchedBy: data.fetchedBy,
      },
      update: {
        value: data.value,
        source: data.source as "PROVIDER" | "MANUAL",
        fetchedBy: data.fetchedBy,
      },
    });
    return {
      id: saved.id,
      country: saved.country,
      period: saved.period,
      value: saved.value.toNumber(),
      source: saved.source,
    };
  }

  async findRentIndex(country: string, period: string) {
    const row = await prisma.rentIncreaseIndex.findUnique({
      where: { country_period: { country, period } },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      country: row.country,
      period: row.period,
      value: row.value.toNumber(),
      source: row.source,
    };
  }

  async updateContractRent(id: string, rentAmountMinor: number): Promise<ContractRow> {
    const updated = await prisma.contract.update({
      where: { id },
      data: { rentAmount: rentAmountMinor / 100 },
    });
    return {
      id: updated.id,
      orgId: updated.orgId,
      propertyId: updated.propertyId,
      tenantId: updated.tenantId,
      number: updated.number,
      status: updated.status,
      startDate: updated.startDate,
      endDate: updated.endDate,
      rentAmountMinor: toMinor(updated.rentAmount),
      currency: updated.currency,
    };
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
