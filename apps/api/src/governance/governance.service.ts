import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildAuditEvent,
  computeQuorum,
  evaluateDecision,
  type AssemblyMajority,
} from "@admin-alquiler/domain";
import { GOVERNANCE_STORE } from "./tokens";
import type { GovernanceStore } from "./store";

@Injectable()
export class GovernanceService {
  constructor(@Inject(GOVERNANCE_STORE) private readonly store: GovernanceStore) {}

  async createAssemblyAct(
    orgId: string,
    actorId: string,
    input: {
      propertyId: string;
      heldAt: string;
      attendance: { ownerId: string; sharePct: number; proxyTo?: string | null }[];
    },
  ) {
    const property = await this.store.findProperty(input.propertyId, orgId);
    if (!property) {
      throw new NotFoundException("Property not found.");
    }
    const heldAt = new Date(input.heldAt);
    if (Number.isNaN(heldAt.getTime())) {
      throw new BadRequestException('Invalid date "heldAt".');
    }
    if (!Array.isArray(input.attendance) || input.attendance.length === 0) {
      throw new BadRequestException("attendance must be a non-empty array.");
    }
    const shares = await this.store.ownershipShares(input.propertyId);
    const shareByOwner = new Map(shares.map((row) => [row.ownerId, row.sharePct]));
    for (const entry of input.attendance) {
      const owned = shareByOwner.get(entry.ownerId);
      if (owned === undefined) {
        throw new BadRequestException(`Owner ${entry.ownerId} holds no shares in this property.`);
      }
      if (entry.sharePct > owned) {
        throw new BadRequestException(
          `Attendance share exceeds owned shares for ${entry.ownerId}.`,
        );
      }
    }
    let quorum: { presentPct: number; quorumMet: boolean };
    try {
      quorum = computeQuorum(input.attendance);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid attendance.");
    }
    const created = await this.store.createAssemblyAct(input.propertyId, {
      heldAt,
      attendance: input.attendance,
      quorumMet: quorum.quorumMet,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "assembly.act_recorded",
        entityType: "AssemblyAct",
        entityId: created.id,
        metadata: { propertyId: input.propertyId, ...quorum },
      }),
    );
    return { ...created, ...quorum, phEnabled: property.phEnabled };
  }

  async listAssemblyActs(propertyId: string, orgId: string) {
    const property = await this.store.findProperty(propertyId, orgId);
    if (!property) {
      throw new NotFoundException("Property not found.");
    }
    return this.store.listAssemblyActs(propertyId);
  }

  private async requireAct(id: string, orgId: string) {
    const act = await this.store.findAssemblyAct(id);
    if (!act || act.orgId !== orgId) {
      throw new NotFoundException("Assembly act not found.");
    }
    return act;
  }

  async createDecision(
    orgId: string,
    actorId: string,
    actId: string,
    input: { title: string; description?: string | null; majority: string },
  ) {
    await this.requireAct(actId, orgId);
    if (input.title.trim().length === 0 || input.title.length > 200) {
      throw new BadRequestException("title must be 1-200 characters.");
    }
    if (input.majority !== "ORDINARY" && input.majority !== "QUALIFIED") {
      throw new BadRequestException('majority must be "ORDINARY" or "QUALIFIED".');
    }
    const created = await this.store.createDecision(actId, {
      title: input.title.trim(),
      description: input.description ?? null,
      majority: input.majority,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "assembly.decision_created",
        entityType: "Decision",
        entityId: created.id,
        metadata: { assemblyActId: actId },
      }),
    );
    return created;
  }

  async listDecisions(actId: string, orgId: string) {
    await this.requireAct(actId, orgId);
    return this.store.listDecisions(actId);
  }

  async recordVote(
    orgId: string,
    actorId: string,
    actId: string,
    decisionId: string,
    input: { ownerId?: string; weight: number; choice: string },
  ) {
    const act = await this.requireAct(actId, orgId);
    const decisions = await this.store.listDecisions(actId);
    if (!decisions.some((row) => row.id === decisionId)) {
      throw new NotFoundException("Decision not found for this act.");
    }
    if (input.choice !== "APPROVE" && input.choice !== "REJECT" && input.choice !== "ABSTAIN") {
      throw new BadRequestException('choice must be "APPROVE", "REJECT" or "ABSTAIN".');
    }
    if (!Number.isFinite(input.weight) || input.weight <= 0 || input.weight > 100) {
      throw new BadRequestException("weight must be within (0, 100].");
    }
    let ownerId: string | null = null;
    if (input.ownerId !== undefined) {
      const shares = await this.store.ownershipShares(act.propertyId);
      const owned = shares.find((row) => row.ownerId === input.ownerId);
      if (!owned) {
        throw new BadRequestException("Voter holds no shares in this property.");
      }
      if (input.weight > owned.sharePct) {
        throw new BadRequestException("Vote weight exceeds owned shares.");
      }
      ownerId = owned.ownerId;
    }
    const saved = await this.store.recordVote(decisionId, {
      ownerId,
      weight: input.weight,
      choice: input.choice,
    });
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId,
        actorId,
        action: "assembly.vote_recorded",
        entityType: "Vote",
        entityId: saved.id,
        metadata: { decisionId },
      }),
    );
    return saved;
  }

  async decisionResult(actId: string, decisionId: string, orgId: string) {
    const act = await this.requireAct(actId, orgId);
    const decisions = await this.store.listDecisions(actId);
    const decision = decisions.find((row) => row.id === decisionId);
    if (!decision) {
      throw new NotFoundException("Decision not found for this act.");
    }
    const votes = await this.store.listVotes(decisionId);
    const shares = await this.store.ownershipShares(act.propertyId);
    const totalShare = shares.reduce((total, row) => total + row.sharePct, 0);
    const { presentPct } = computeQuorum(act.attendance);
    const outcome = evaluateDecision(
      votes.map((vote) => ({ choice: vote.choice, weight: vote.weight })),
      decision.majority as AssemblyMajority,
      totalShare,
      presentPct,
    );
    return { decision, votes, totalShare, presentPct, ...outcome };
  }
}
