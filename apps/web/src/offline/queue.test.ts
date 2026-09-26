import { describe, expect, test } from "bun:test";
import { OfflineQueue, type StorageLike } from "./queue";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({ ok: status < 300 }), { status });
}

describe("offline mutation queue", () => {
  test("persists across instances via storage", () => {
    const storage = memoryStorage();
    const first = new OfflineQueue(storage);
    first.enqueue({ url: "/api/v1/ping", body: "{}" });
    expect(first.size).toBe(1);
    const second = new OfflineQueue(storage);
    expect(second.size).toBe(1);
    expect(second.pending()[0]?.url).toBe("/api/v1/ping");
  });

  test("server-wins: 409 conflicts are dropped and reported", async () => {
    const storage = memoryStorage();
    const queue = new OfflineQueue(storage);
    queue.enqueue({ url: "/api/v1/a", body: "{}" });
    queue.enqueue({ url: "/api/v1/b", body: "{}" });
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return jsonResponse(String(url).endsWith("/a") ? 201 : 409);
    }) as unknown as typeof fetch;
    try {
      const result = await queue.flush();
      expect(result.sent).toHaveLength(1);
      expect(result.conflicted).toHaveLength(1);
      expect(queue.size).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("network failures stay queued with attempt counts", async () => {
    const storage = memoryStorage();
    const queue = new OfflineQueue(storage);
    queue.enqueue({ url: "/api/v1/a", body: "{}", maxAttempts: 2 });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    try {
      const first = await queue.flush();
      expect(first.pending).toHaveLength(1);
      expect(queue.pending()[0]?.attempts).toBe(1);
      const second = await queue.flush();
      expect(second.pending).toHaveLength(0);
      expect(second.conflicted).toHaveLength(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
