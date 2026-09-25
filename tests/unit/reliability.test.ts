import { describe, expect, test } from "bun:test";
import { listQueues, registerQueue } from "@admin-alquiler/events";
import { resolveRequestId } from "../../apps/api/src/request-id";

describe("resolveRequestId", () => {
  test("reuses a valid inbound request ID", () => {
    expect(resolveRequestId("req-123")).toBe("req-123");
  });

  test("generates an ID when inbound is missing or blank", () => {
    const a = resolveRequestId(undefined);
    const b = resolveRequestId("   ");
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe("queue registry", () => {
  test("ships with the expected baseline queues", () => {
    const queues = listQueues();
    for (const name of [
      "email",
      "pdf",
      "notifications",
      "reminders",
      "imports",
      "charges",
    ]) {
      expect(queues).toContain(name);
    }
  });

  test("registerQueue adds a queue once", () => {
    registerQueue("test-queue");
    registerQueue("test-queue");
    expect(listQueues().filter((q) => q === "test-queue")).toHaveLength(1);
  });
});
