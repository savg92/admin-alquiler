import { describe, expect, test } from "bun:test";
import { clearSession, readSession, writeSession } from "./session";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe("web session", () => {
  test("round-trips token and org", () => {
    const storage = memoryStorage();
    expect(readSession(storage)).toBeNull();
    writeSession(storage, { token: "tok", orgId: "org-1" });
    expect(readSession(storage)).toEqual({ token: "tok", orgId: "org-1" });
    clearSession(storage);
    expect(readSession(storage)).toBeNull();
  });

  test("login posts credentials and returns a token", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ accessToken: "tok-123" }), {
        status: 200,
      })) as unknown as typeof fetch;
    try {
      const { login } = await import("./session");
      const result = await login("a@ejemplo.co", "secret");
      expect(result.accessToken).toBe("tok-123");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
