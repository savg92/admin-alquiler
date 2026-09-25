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
  writeAuditEvent(event: AuditInput): Promise<void>;
}
