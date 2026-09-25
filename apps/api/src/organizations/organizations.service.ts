import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { buildAuditEvent } from "@admin-alquiler/domain";
import { ORGS_STORE } from "./tokens";
import type { OrgInput, OrgRow, OrgsStore } from "./store";

const BASELINE_PERMISSIONS = [
  "property:read",
  "property:write",
  "contract:read",
  "contract:write",
  "payment:read",
  "payment:write",
  "settlement:read",
  "settlement:write",
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
}
