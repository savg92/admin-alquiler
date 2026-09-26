export interface AttendanceEntry {
  ownerId: string;
  sharePct: number;
  proxyTo?: string | null;
}

export interface QuorumResult {
  presentPct: number;
  quorumMet: boolean;
}

export function computeQuorum(attendance: AttendanceEntry[]): QuorumResult {
  const direct = new Map<string, number>();
  const proxies = new Map<string, number>();
  for (const entry of attendance) {
    if (typeof entry.ownerId !== "string" || entry.ownerId.trim().length === 0) {
      throw new Error("Attendance ownerId is required.");
    }
    if (!Number.isFinite(entry.sharePct) || entry.sharePct < 0 || entry.sharePct > 100) {
      throw new Error("Attendance sharePct must be between 0 and 100.");
    }
    if (entry.proxyTo !== undefined && entry.proxyTo !== null) {
      if (entry.proxyTo === entry.ownerId) {
        throw new Error("A proxy cannot point to its own owner.");
      }
      proxies.set(entry.proxyTo, (proxies.get(entry.proxyTo) ?? 0) + entry.sharePct);
    } else {
      direct.set(entry.ownerId, (direct.get(entry.ownerId) ?? 0) + entry.sharePct);
    }
  }
  const holders = new Set([...direct.keys(), ...proxies.keys()]);
  let presentPct = 0;
  for (const holder of holders) {
    presentPct += (direct.get(holder) ?? 0) + (proxies.get(holder) ?? 0);
  }
  presentPct = Math.min(100, Math.round(presentPct * 100) / 100);
  return { presentPct, quorumMet: presentPct > 50 };
}

export type AssemblyMajority = "ORDINARY" | "QUALIFIED";

export interface VoteTally {
  choice: "APPROVE" | "REJECT" | "ABSTAIN";
  weight: number;
}

export interface DecisionOutcome {
  approveWeight: number;
  rejectWeight: number;
  abstainWeight: number;
  approved: boolean;
}

export function evaluateDecision(
  votes: VoteTally[],
  majority: AssemblyMajority,
  totalShare: number,
  presentPct: number,
): DecisionOutcome {
  let approveWeight = 0;
  let rejectWeight = 0;
  let abstainWeight = 0;
  for (const vote of votes) {
    if (!Number.isFinite(vote.weight) || vote.weight < 0) {
      throw new Error("Vote weight must be a non-negative number.");
    }
    if (vote.choice === "APPROVE") {
      approveWeight += vote.weight;
    } else if (vote.choice === "REJECT") {
      rejectWeight += vote.weight;
    } else if (vote.choice === "ABSTAIN") {
      abstainWeight += vote.weight;
    } else {
      throw new Error(`Invalid vote choice "${vote.choice}".`);
    }
  }
  if (majority === "QUALIFIED") {
    return {
      approveWeight,
      rejectWeight,
      abstainWeight,
      approved: totalShare > 0 && approveWeight >= 0.7 * totalShare,
    };
  }
  return {
    approveWeight,
    rejectWeight,
    abstainWeight,
    approved: presentPct > 0 && approveWeight > 0.5 * presentPct,
  };
}

export type ApprovalRuleMode = "one" | "quorum" | "percentage" | "all";

export function evaluateApprovalRule(
  mode: ApprovalRuleMode,
  approvedShare: number,
  totalShare: number,
  percentage?: number,
): boolean {
  if (!["one", "quorum", "percentage", "all"].includes(mode)) {
    throw new Error(`Invalid approval mode "${mode}".`);
  }
  if (mode === "one") {
    return approvedShare > 0;
  }
  if (mode === "all") {
    return totalShare > 0 && approvedShare >= totalShare;
  }
  if (mode === "quorum") {
    return totalShare > 0 && approvedShare > 0.5 * totalShare;
  }
  if (
    percentage === undefined ||
    !Number.isFinite(percentage) ||
    percentage <= 0 ||
    percentage > 100
  ) {
    throw new Error("percentage must be within (0, 100] for percentage mode.");
  }
  return totalShare > 0 && approvedShare >= (percentage / 100) * totalShare;
}
