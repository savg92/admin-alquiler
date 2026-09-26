export interface AssemblyActRow {
  id: string;
  propertyId: string;
  heldAt: Date;
  attendance: { ownerId: string; sharePct: number; proxyTo?: string | null }[];
  quorumMet: boolean;
}

export interface DecisionRow {
  id: string;
  assemblyActId: string;
  title: string;
  description: string | null;
  majority: "ORDINARY" | "QUALIFIED";
}

export interface VoteRow {
  id: string;
  decisionId: string;
  ownerId: string | null;
  weight: number;
  choice: "APPROVE" | "REJECT" | "ABSTAIN";
}

export interface OwnershipShareRow {
  ownerId: string;
  sharePct: number;
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface GovernanceStore {
  findProperty(id: string, orgId: string): Promise<{ id: string; phEnabled: boolean } | null>;
  ownershipShares(propertyId: string): Promise<OwnershipShareRow[]>;
  createAssemblyAct(
    propertyId: string,
    data: {
      heldAt: Date;
      attendance: { ownerId: string; sharePct: number; proxyTo?: string | null }[];
      quorumMet: boolean;
    },
  ): Promise<AssemblyActRow>;
  listAssemblyActs(propertyId: string): Promise<AssemblyActRow[]>;
  findAssemblyAct(id: string): Promise<(AssemblyActRow & { orgId: string }) | null>;
  createDecision(
    assemblyActId: string,
    data: { title: string; description: string | null; majority: "ORDINARY" | "QUALIFIED" },
  ): Promise<DecisionRow>;
  listDecisions(assemblyActId: string): Promise<DecisionRow[]>;
  recordVote(
    decisionId: string,
    data: { ownerId: string | null; weight: number; choice: "APPROVE" | "REJECT" | "ABSTAIN" },
  ): Promise<VoteRow>;
  listVotes(decisionId: string): Promise<VoteRow[]>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
