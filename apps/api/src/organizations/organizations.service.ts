import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { buildAuditEvent } from "@admin-alquiler/domain";
import type { MembershipStatus } from "@admin-alquiler/permissions";
import { ORGS_STORE } from "./tokens";
import type { MemberRow, OrgInput, OrgRow, OrgsStore } from "./store";

const BASELINE_PERMISSIONS = [
  "property:read",
  "property:write",
  "contract:read",
  "contract:write",
  "payment:read",
  "payment:write",
  "settlement:read",
  "settlement:write",
  "finance:read",
  "finance:write",
];

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) {
    throw new BadRequestException("Organization name must contain letters or numbers.");
  }
  return slug;
}

@Injectable()
export class OrganizationsService {
  constructor(@Inject(ORGS_STORE) private readonly store: OrgsStore) {}

  async createOrganization(userId: string, input: OrgInput): Promise<OrgRow> {
    if (input.name.trim().length === 0) {
      throw new BadRequestException("Organization name is required.");
    }
    const slug = (input.slug ?? slugify(input.name)).trim().toLowerCase();
    if (slug.length === 0) {
      throw new BadRequestException("Organization slug is required.");
    }
    if (await this.store.findOrgBySlug(slug)) {
      throw new ConflictException("Organization slug already exists.");
    }
    const created = await this.store.createOrg({
      slug,
      name: input.name.trim(),
      country: input.country ?? "CO",
      locale: input.locale ?? "es-CO",
      currency: input.currency ?? "COP",
      timezone: input.timezone ?? "America/Bogota",
    });
    const role = await this.store.ensureAdminRole(created.id, BASELINE_PERMISSIONS);
    await this.store.createMembership(userId, created.id, role.id);
    await this.store.writeAuditEvent(
      buildAuditEvent({
        orgId: created.id,
        actorId: userId,
        action: "organization.created",
        entityType: "Organization",
        entityId: created.id,
      }),
    );
    return created;
  }

  async listMembers(orgId: string): Promise<MemberRow[]> {
    const org = await this.store.findOrgById(orgId);
    if (!org) {
      throw new NotFoundException("Organization not found.");
    }
    return this.store.listMembers(orgId);
  }

  async updateMember(
    orgId: string,
    actorId: string,
    targetUserId: string,
    input: { roleName?: unknown; status?: unknown },
  ): Promise<MemberRow> {
    const org = await this.store.findOrgById(orgId);
    if (!org) {
      throw new NotFoundException("Organization not found.");
    }
    if (actorId === targetUserId) {
      throw new ForbiddenException("You cannot change your own membership.");
    }
    const current = await this.store.findMembership(orgId, targetUserId);
    if (!current) {
      throw new NotFoundException("Membership not found.");
    }
    let roleId: string | undefined;
    if (input.roleName !== undefined) {
      if (typeof input.roleName !== "string" || input.roleName.trim().length === 0) {
        throw new BadRequestException("Role name is required.");
      }
      const role = await this.store.findRoleByName(orgId, input.roleName.trim());
      if (!role) {
        throw new NotFoundException("Role not found in this organization.");
      }
      roleId = role.id;
    }
    let status: MembershipStatus | undefined;
    if (input.status !== undefined) {
      if (input.status !== "ACTIVE" && input.status !== "SUSPENDED" && input.status !== "REVOKED") {
        throw new BadRequestException("Status must be ACTIVE, SUSPENDED or REVOKED.");
      }
      status = input.status;
    }
    if (roleId === undefined && status === undefined) {
      throw new BadRequestException("Nothing to update. Provide roleName and/or status.");
    }
    const updated = await this.store.updateMembership(orgId, targetUserId, {
      ...(roleId === undefined ? {} : { roleId }),
      ...(status === undefined ? {} : { status }),
    });
    const changes: string[] = [];
    if (roleId !== undefined && current.roleName !== updated.roleName) {
      changes.push("member.role_changed");
    }
    if (status !== undefined && current.status !== updated.status) {
      changes.push("member.status_changed");
    }
    for (const action of changes.length > 0 ? changes : ["member.updated"]) {
      await this.store.writeAuditEvent(
        buildAuditEvent({
          orgId,
          actorId,
          action,
          entityType: "Membership",
          entityId: targetUserId,
          metadata: { roleName: updated.roleName, status: updated.status },
        }),
      );
    }
    return updated;
  }
}
