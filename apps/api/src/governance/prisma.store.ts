import { prisma } from "@admin-alquiler/database";
import type {
  AssemblyActRow,
  AuditInput,
  DecisionRow,
  GovernanceStore,
  OwnershipShareRow,
  VoteRow,
} from "./store";

function toJsonInput(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

type AttendanceJson = { ownerId: string; sharePct: number; proxyTo?: string | null }[];

export class PrismaGovernanceStore implements GovernanceStore {
  async findProperty(id: string, orgId: string) {
    const row = await prisma.property.findFirst({
      where: { id, orgId },
      select: { id: true, phEnabled: true },
    });
    return row;
  }

  async ownershipShares(propertyId: string): Promise<OwnershipShareRow[]> {
    const rows = await prisma.propertyOwnership.findMany({
      where: { propertyId, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
      select: { ownerId: true, sharePct: true },
    });
    return rows.map((row) => ({ ownerId: row.ownerId, sharePct: row.sharePct.toNumber() }));
  }

  async createAssemblyAct(
    propertyId: string,
    data: { heldAt: Date; attendance: AttendanceJson; quorumMet: boolean },
  ): Promise<AssemblyActRow> {
    const created = await prisma.assemblyAct.create({
      data: {
        propertyId,
        heldAt: data.heldAt,
        attendance: toJsonInput({ entries: data.attendance }),
        quorumMet: data.quorumMet,
      },
    });
    return {
      id: created.id,
      propertyId: created.propertyId,
      heldAt: created.heldAt,
      attendance: data.attendance,
      quorumMet: created.quorumMet,
    };
  }

  async listAssemblyActs(propertyId: string): Promise<AssemblyActRow[]> {
    const rows = await prisma.assemblyAct.findMany({
      where: { propertyId },
      orderBy: { heldAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      propertyId: row.propertyId,
      heldAt: row.heldAt,
      attendance: ((row.attendance as { entries?: AttendanceJson } | null)?.entries ??
        []) as AttendanceJson,
      quorumMet: row.quorumMet,
    }));
  }

  async findAssemblyAct(id: string): Promise<(AssemblyActRow & { orgId: string }) | null> {
    const row = await prisma.assemblyAct.findUnique({
      where: { id },
      include: { property: { select: { orgId: true } } },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      propertyId: row.propertyId,
      heldAt: row.heldAt,
      attendance: ((row.attendance as { entries?: AttendanceJson } | null)?.entries ??
        []) as AttendanceJson,
      quorumMet: row.quorumMet,
      orgId: row.property.orgId,
    };
  }

  async createDecision(
    assemblyActId: string,
    data: { title: string; description: string | null; majority: "ORDINARY" | "QUALIFIED" },
  ): Promise<DecisionRow> {
    const created = await prisma.decision.create({
      data: {
        assemblyActId,
        title: data.title,
        description: data.description,
        majority: data.majority,
      },
    });
    return {
      id: created.id,
      assemblyActId: created.assemblyActId,
      title: created.title,
      description: created.description,
      majority: created.majority,
    };
  }

  async listDecisions(assemblyActId: string): Promise<DecisionRow[]> {
    const rows = await prisma.decision.findMany({
      where: { assemblyActId },
      orderBy: { title: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      assemblyActId: row.assemblyActId,
      title: row.title,
      description: row.description,
      majority: row.majority,
    }));
  }

  async recordVote(
    decisionId: string,
    data: { ownerId: string | null; weight: number; choice: "APPROVE" | "REJECT" | "ABSTAIN" },
  ): Promise<VoteRow> {
    const created = await prisma.vote.create({
      data: { decisionId, ownerId: data.ownerId, weight: data.weight, choice: data.choice },
    });
    return {
      id: created.id,
      decisionId: created.decisionId,
      ownerId: created.ownerId,
      weight: created.weight.toNumber(),
      choice: created.choice,
    };
  }

  async listVotes(decisionId: string): Promise<VoteRow[]> {
    const rows = await prisma.vote.findMany({ where: { decisionId } });
    return rows.map((row) => ({
      id: row.id,
      decisionId: row.decisionId,
      ownerId: row.ownerId,
      weight: row.weight.toNumber(),
      choice: row.choice,
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
