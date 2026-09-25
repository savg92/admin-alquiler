import { describe, expect, test } from "bun:test";
import { MemoryIdempotencyStore } from "../../apps/api/src/idempotency/memory.store";
import { compareRecord, hashPayload, storageKey } from "../../apps/api/src/idempotency/store";

describe("idempotency convention", () => {
  test("hashPayload is stable and payload-sensitive", () => {
    expect(hashPayload({ a: 1 })).toBe(hashPayload({ a: 1 }));
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });

  test("storageKey scopes per organization and user", () => {
    const a = storageKey("org-1", "user-1", "key-1");
    expect(a).not.toBe(storageKey("org-2", "user-1", "key-1"));
    expect(a).not.toBe(storageKey("org-1", "user-2", "key-1"));
  });

  test("compareRecord implements miss/replay/conflict/expiry", () => {
    expect(compareRecord(null, "abc")).toBe("miss");
    const record = {
      payloadHash: "abc",
      status: 201,
      body: {},
      createdAt: new Date().toISOString(),
    };
    expect(compareRecord(record, "abc")).toBe("replay");
    expect(compareRecord(record, "xyz")).toBe("conflict");
    const expired = {
      ...record,
      createdAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    };
    expect(compareRecord(expired, "abc")).toBe("miss");
  });

  test("memory store round-trips records", async () => {
    const store = new MemoryIdempotencyStore();
    expect(await store.get("k")).toBeNull();
    const record = {
      payloadHash: "abc",
      status: 201,
      body: { ok: true },
      createdAt: new Date().toISOString(),
    };
    await store.set("k", record, 100);
    expect(await store.get("k")).toEqual(record);
  });
});
