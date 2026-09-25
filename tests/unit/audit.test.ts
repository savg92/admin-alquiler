import { describe, expect, test } from "bun:test";
import { buildAuditEvent } from "@admin-alquiler/domain";

describe("audit events", () => {
  test("builds identity audit events with actor and entity", () => {
    const event = buildAuditEvent(
      {
        orgId: "org-a",
        actorId: "user-1",
        action: "member.role.changed",
        entityType: "Membership",
        entityId: "member-1",
        metadata: { from: "viewer", to: "admin" },
      },
      1_700_000_000_000,
    );
    expect(event.action).toBe("member.role.changed");
    expect(event.actorId).toBe("user-1");
    expect(event.entityId).toBe("member-1");
    expect(event.createdAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  test("rejects empty actions", () => {
    expect(() => buildAuditEvent({ action: "   " })).toThrow(/must not be empty/);
  });
});
