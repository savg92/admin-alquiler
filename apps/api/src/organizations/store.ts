import type { MembershipStatus } from "@admin-alquiler/permissions";

export interface OrgInput {
  name: string;
  slug?: string | undefined;
  country?: string | undefined;
  locale?: string | undefined;
  currency?: string | undefined;
  timezone?: string | undefined;
}

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  country: string;
  locale: string;
  currency: string;
  timezone: string;
}

export interface MemberRow {
  userId: string;
  orgId: string;
  status: MembershipStatus;
  roleName: string;
}

export interface AuditInput {
  orgId?: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface OrgsStore {
  findOrgBySlug(slug: string): Promise<{ id: string } | null>;
  findOrgById(id: string): Promise<{ id: string } | null>;
  createOrg(data: {
    slug: string;
    name: string;
    country: string;
    locale: string;
    currency: string;
    timezone: string;
  }): Promise<OrgRow>;
  ensureAdminRole(orgId: string, permissions: string[]): Promise<{ id: string; name: string }>;
  createMembership(userId: string, orgId: string, roleId: string): Promise<void>;
  listMembers(orgId: string): Promise<MemberRow[]>;
  findMembership(orgId: string, userId: string): Promise<MemberRow | null>;
  findRoleByName(orgId: string, name: string): Promise<{ id: string; name: string } | null>;
  updateMembership(
    orgId: string,
    userId: string,
    data: { roleId?: string; status?: MembershipStatus },
  ): Promise<MemberRow>;
  writeAuditEvent(event: AuditInput): Promise<void>;
}
