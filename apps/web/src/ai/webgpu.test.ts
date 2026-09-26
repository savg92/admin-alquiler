import { describe, expect, test } from "bun:test";
import { AiGatewayClient, type InferenceRunner } from "./gateway-client";
import { ModelCache, type StorageLike } from "./model-cache";
import {
  MIN_DEVICE_MEMORY_GB,
  MIN_MAX_BUFFER_BYTES,
  probeWebGpu,
  shouldUseWebGpu,
  type GpuLike,
} from "./webgpu";

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function gpu(
  options: { maxBufferSize?: number; features?: string[]; adapter?: boolean } = {},
): GpuLike {
  return {
    requestAdapter: async () => {
      if (options.adapter === false) {
        return null;
      }
      return {
        limits: { maxBufferSize: options.maxBufferSize ?? MIN_MAX_BUFFER_BYTES * 4 },
        features: options.features ?? ["shader-f16"],
      };
    },
  };
}

describe("WebGPU capability detection", () => {
  test("reports no WebGPU when the API is absent", async () => {
    expect(await probeWebGpu(undefined, { deviceMemoryGb: 8 })).toEqual({
      supported: false,
      reason: "no-webgpu",
    });
  });

  test("rejects a low-memory mobile device before touching the adapter", async () => {
    let requested = false;
    const spy: GpuLike = {
      requestAdapter: async () => {
        requested = true;
        return null;
      },
    };
    const result = await probeWebGpu(spy, { deviceMemoryGb: MIN_DEVICE_MEMORY_GB - 1 });
    expect(result).toEqual({ supported: false, reason: "insufficient-memory" });
    expect(requested).toBe(false);
  });

  test("rejects when no adapter is available", async () => {
    expect(await probeWebGpu(gpu({ adapter: false }), { deviceMemoryGb: 8 })).toEqual({
      supported: false,
      reason: "no-adapter",
    });
  });

  test("rejects when the adapter cannot host the model", async () => {
    expect(await probeWebGpu(gpu({ maxBufferSize: 1024 }), { deviceMemoryGb: 8 })).toEqual({
      supported: false,
      reason: "insufficient-buffer",
    });
  });

  test("classifies a throwing adapter as a probe failure instead of crashing", async () => {
    const throwing: GpuLike = {
      requestAdapter: async () => {
        throw new Error("context lost");
      },
    };
    expect(await probeWebGpu(throwing, { deviceMemoryGb: 8 })).toEqual({
      supported: false,
      reason: "probe-failed",
    });
  });

  test("accepts a capable adapter and reports its limits", async () => {
    const result = await probeWebGpu(gpu(), { deviceMemoryGb: 8 });
    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.features).toContain("shader-f16");
      expect(result.maxBufferBytes).toBeGreaterThanOrEqual(MIN_MAX_BUFFER_BYTES);
      expect(shouldUseWebGpu(result)).toBe(true);
    }
  });

  test("an unknown device memory does not block a desktop", async () => {
    expect((await probeWebGpu(gpu(), undefined)).supported).toBe(true);
  });
});

describe("model cache with interrupted-download recovery", () => {
  test("a completed download is cached", () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.startDownload("m1", 1000);
    const done = cache.recordProgress("m1", 1000);
    expect(done.state).toBe("complete");
    expect(cache.isComplete("m1")).toBe(true);
  });

  test("an interrupted download resumes from its recorded offset", () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.startDownload("m1", 1000);
    cache.recordProgress("m1", 400);
    expect(cache.get("m1")?.state).toBe("downloading");
    expect(cache.resumeOffset("m1")).toBe(400);
    const resumed = cache.recordProgress("m1", 1000);
    expect(resumed.state).toBe("complete");
    expect(resumed.receivedBytes).toBe(1000);
  });

  test("a resumed download does not restart from zero", () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.startDownload("m1", 1000);
    cache.recordProgress("m1", 700);
    const restarted = cache.startDownload("m1", 1000);
    expect(restarted.receivedBytes).toBe(700);
  });

  test("a failed download restarts from zero on the next attempt", () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.startDownload("m1", 1000);
    cache.recordProgress("m1", 600);
    expect(cache.fail("m1").state).toBe("failed");
    const retry = cache.startDownload("m1", 1000);
    expect(retry.receivedBytes).toBe(0);
  });

  test("state survives a new instance over the same storage", () => {
    const storage = new MemoryStorage();
    const first = new ModelCache(storage);
    first.startDownload("m1", 1000);
    first.recordProgress("m1", 250);
    const second = new ModelCache(storage);
    expect(second.get("m1")?.receivedBytes).toBe(250);
    expect(second.interrupted()).toHaveLength(1);
  });

  test("a half-written entry is never marked complete", () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.startDownload("m1", 1000);
    cache.recordProgress("m1", 999);
    expect(cache.isComplete("m1")).toBe(false);
  });

  test("progress beyond the total clamps to the total", () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.startDownload("m1", 1000);
    const entry = cache.recordProgress("m1", 5000);
    expect(entry.receivedBytes).toBe(1000);
    expect(entry.state).toBe("complete");
  });

  test("progress without a started download is an error", () => {
    const cache = new ModelCache(new MemoryStorage());
    expect(() => cache.recordProgress("ghost", 10)).toThrow(/not started/);
  });

  test("corrupt storage is treated as an empty cache", () => {
    const storage = new MemoryStorage();
    storage.setItem("admin-alquiler.model-cache.v1", "{not json");
    expect(new ModelCache(storage).list()).toEqual([]);
  });

  test("evicting removes the entry", () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.startDownload("m1", 10);
    cache.complete("m1", 10);
    cache.evict("m1");
    expect(cache.get("m1")).toBeNull();
  });
});

describe("gateway client falls back when WebGPU is unusable", () => {
  function client(options: {
    gpu: GpuLike | undefined;
    textResponse: unknown;
    completeResponse?: unknown;
    runner?: InferenceRunner;
    cache?: ModelCache;
  }) {
    const calls: string[] = [];
    const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
      const path = url.endsWith("/text") ? "text" : "complete";
      calls.push(path);
      const body =
        path === "text" ? options.textResponse : (options.completeResponse ?? { text: "ok" });
      void init;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    const instance = new AiGatewayClient({
      baseUrl: "https://api.test",
      authHeaders: () => ({ Authorization: "Bearer t" }),
      gpu: options.gpu,
      memory: { deviceMemoryGb: 8 },
      cache: options.cache ?? new ModelCache(new MemoryStorage()),
      runInference: options.runner ?? (async ({ prompt }) => `local:${prompt}`),
    });
    return {
      instance,
      calls,
      restore: () => {
        globalThis.fetch = original;
      },
    };
  }

  test("uses the server runtime when WebGPU is unavailable", async () => {
    const harness = client({
      gpu: undefined,
      textResponse: { available: true, runtime: "local", model: "m", text: "del servidor" },
    });
    try {
      const result = await harness.instance.run({
        feature: "draft",
        prompt: "hola",
        dataClasses: ["PUBLIC"],
      });
      expect(result).toEqual({ source: "server", text: "del servidor", model: "m" });
      expect(harness.calls).toEqual(["text"]);
    } finally {
      harness.restore();
    }
  });

  test("reports the reason instead of failing when AI is off", async () => {
    const harness = client({
      gpu: undefined,
      textResponse: { available: false, reason: "AI is disabled." },
    });
    try {
      const result = await harness.instance.run({
        feature: "draft",
        prompt: "hola",
        dataClasses: ["PUBLIC"],
      });
      expect(result).toEqual({ source: "none", reason: "AI is disabled." });
    } finally {
      harness.restore();
    }
  });

  test("runs on-device when the server defers and the model is cached", async () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.complete("m", 100);
    const harness = client({
      gpu: gpu(),
      cache,
      textResponse: {
        available: true,
        runtime: "webgpu",
        model: "m",
        deferred: true,
        payload: { prompt: "hola", maxTokens: 256 },
      },
    });
    try {
      const result = await harness.instance.run({
        feature: "draft",
        prompt: "hola",
        dataClasses: ["PUBLIC"],
      });
      expect(result).toEqual({ source: "webgpu", text: "ok", model: "m" });
      expect(harness.calls).toEqual(["text", "complete"]);
    } finally {
      harness.restore();
    }
  });

  test("does not run on-device when the model is not downloaded", async () => {
    const harness = client({
      gpu: gpu(),
      textResponse: {
        available: true,
        runtime: "webgpu",
        model: "m",
        deferred: true,
        payload: { prompt: "hola", maxTokens: 256 },
      },
    });
    try {
      const result = await harness.instance.run({
        feature: "draft",
        prompt: "hola",
        dataClasses: ["PUBLIC"],
      });
      expect(result.source).toBe("none");
      expect(harness.calls).toEqual(["text"]);
    } finally {
      harness.restore();
    }
  });

  test("falls back cleanly when on-device inference throws", async () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.complete("m", 100);
    const harness = client({
      gpu: gpu(),
      cache,
      runner: async () => {
        throw new Error("device lost");
      },
      textResponse: {
        available: true,
        runtime: "webgpu",
        model: "m",
        deferred: true,
        payload: { prompt: "hola", maxTokens: 256 },
      },
    });
    try {
      const result = await harness.instance.run({
        feature: "draft",
        prompt: "hola",
        dataClasses: ["PUBLIC"],
      });
      expect(result).toEqual({ source: "none", reason: "On-device inference failed." });
    } finally {
      harness.restore();
    }
  });

  test("rejects an on-device result the server refuses", async () => {
    const cache = new ModelCache(new MemoryStorage());
    cache.complete("m", 100);
    const harness = client({
      gpu: gpu(),
      cache,
      completeResponse: { available: false, reason: "rejected" },
      textResponse: {
        available: true,
        runtime: "webgpu",
        model: "m",
        deferred: true,
        payload: { prompt: "hola", maxTokens: 256 },
      },
    });
    try {
      const result = await harness.instance.run({
        feature: "draft",
        prompt: "hola",
        dataClasses: ["PUBLIC"],
      });
      expect(result).toEqual({
        source: "none",
        reason: "On-device result was rejected by the server.",
      });
    } finally {
      harness.restore();
    }
  });

  test("an HTTP error is surfaced as a reason, not a crash", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("nope", { status: 500 })) as unknown as typeof fetch;
    try {
      const instance = new AiGatewayClient({
        baseUrl: "https://api.test",
        authHeaders: () => ({}),
        gpu: undefined,
        memory: undefined,
        cache: new ModelCache(new MemoryStorage()),
        runInference: async () => "",
      });
      const result = await instance.run({ feature: "draft", prompt: "x", dataClasses: ["PUBLIC"] });
      expect(result.source).toBe("none");
    } finally {
      globalThis.fetch = original;
    }
  });
});
