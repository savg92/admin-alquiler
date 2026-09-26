import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readAiConfig } from "@admin-alquiler/config";
import {
  buildDecisionAdapter,
  HostedDecisionAdapter,
  SelfHostedDecisionAdapter,
  type DecisionRequest,
} from "../src/ai/decision-adapters";
import { ProviderAdapter } from "../src/ai/provider-adapter";
import { postJson, UpstreamError } from "../src/ai/transport";
import { AiObservabilityService } from "../src/ai/observability";

interface Hit {
  path: string;
  authorization: string | null;
  body: Record<string, unknown>;
}

const hits: Hit[] = [];
let flaky: { attempts: number; mode: "rate-limited" | "server-error" | "reject" | "hang" } = {
  attempts: 0,
  mode: "rate-limited",
};

function decideBody(body: Record<string, unknown>): unknown {
  switch (body.model) {
    case "both":
      return { choice: "urgent", score: 0.5, confidence: 0.9 };
    case "out-of-range":
      return { choice: "urgent", confidence: 1.7 };
    case "alien":
      return { choice: "defraud", confidence: 0.95 };
    default:
      return { choice: "urgent", confidence: 0.93 };
  }
}

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    hits.push({ path: url.pathname, authorization: request.headers.get("authorization"), body });

    if (url.pathname === "/flaky") {
      flaky.attempts += 1;
      if (flaky.mode === "hang") {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      if (flaky.mode === "reject") {
        return Response.json({ error: "bad request" }, { status: 400 });
      }
      if (flaky.attempts === 1) {
        if (flaky.mode === "rate-limited") {
          return Response.json(
            { error: "quota" },
            { status: 429, headers: { "Retry-After": "0" } },
          );
        }
        return Response.json({ error: "boom" }, { status: 503 });
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === "/v1/decide" || url.pathname === "/decide") {
      return Response.json(decideBody(body));
    }
    if (url.pathname === "/v1/chat/completions") {
      return Response.json({
        choices: [{ message: { content: "respuesta" } }],
        usage: { prompt_tokens: 11, completion_tokens: 3 },
      });
    }
    if (url.pathname === "/v1/embeddings") {
      return Response.json(
        body.model === "bad-vector"
          ? { data: [{ embedding: ["a", "b"] }] }
          : { data: [{ embedding: [0.5, 0.25] }] },
      );
    }
    return new Response("not found", { status: 404 });
  },
});

const base = `http://127.0.0.1:${server.port}`;
const policy = { timeoutMs: 1000, maxRetries: 2 };

function request(overrides: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    question: "¿Urgente?",
    questionType: "triage",
    dataClasses: ["PUBLIC"],
    redact: (text) => text.replace(/\S+@\S+/g, "[email]"),
    ...overrides,
  };
}

beforeAll(() => {
  hits.length = 0;
});

afterAll(() => {
  server.stop(true);
});

describe("§4 self-hosted decision adapter is the default", () => {
  test("buildDecisionAdapter returns the self-hosted adapter by default", () => {
    const adapter = buildDecisionAdapter(
      readAiConfig({ AI_DECISION_PROVIDER: "laya", AI_DECISION_BASE_URL: base } as never),
    );
    expect(adapter).toBeInstanceOf(SelfHostedDecisionAdapter);
    expect(adapter.name).toBe("laya");
    expect(adapter.hosted).toBe(false);
  });

  test("it posts to /decide and returns a typed choice", async () => {
    const adapter = new SelfHostedDecisionAdapter(base, "laya-0.4b", policy);
    const answer = await adapter.decide(request());
    expect(answer).toEqual({ kind: "choice", choice: "urgent", confidence: 0.93 });
    const last = hits[hits.length - 1];
    expect(last?.path).toBe("/decide");
    expect(last?.body.model).toBe("laya-0.4b");
    expect(last?.body.questionType).toBe("triage");
  });

  test("the self-hosted adapter never redacts, because the data never leaves", async () => {
    const adapter = new SelfHostedDecisionAdapter(base, "laya-0.4b", policy);
    await adapter.decide(request({ question: "ana@ejemplo.co" }));
    const last = hits[hits.length - 1];
    expect(last?.body.question).toBe("ana@ejemplo.co");
  });
});

describe("§4-§5 the hosted adapter is swappable by configuration only", () => {
  test("it implements the same interface and answers identically", async () => {
    const adapter = new HostedDecisionAdapter(base, "jev", "secret-key", policy);
    const answer = await adapter.decide(request());
    expect(answer).toEqual({ kind: "choice", choice: "urgent", confidence: 0.93 });
    const last = hits[hits.length - 1];
    expect(last?.path).toBe("/v1/decide");
    expect(last?.authorization).toBe("Bearer secret-key");
  });

  test("buildDecisionAdapter selects it from configuration", () => {
    const adapter = buildDecisionAdapter(
      readAiConfig({
        AI_DECISION_PROVIDER: "jev",
        AI_DECISION_BASE_URL: base,
        AI_DECISION_API_KEY: "k",
      } as never),
    );
    expect(adapter).toBeInstanceOf(HostedDecisionAdapter);
    expect(adapter.hosted).toBe(true);
  });

  test("a hosted adapter redacts before sending", async () => {
    const adapter = new HostedDecisionAdapter(base, "jev", null, policy);
    await adapter.decide(request({ question: "avisar a ana@ejemplo.co" }));
    const last = hits[hits.length - 1];
    expect(last?.authorization).toBeNull();
    expect(last?.body.question).toBe("avisar a [email]");
  });
});

describe("decision answers are validated before use", () => {
  const cases: { name: string; model: string; message: RegExp }[] = [
    { name: "both choice and score", model: "both", message: /either choice or score/ },
    { name: "confidence out of range", model: "out-of-range", message: /within \[0, 1\]/ },
    { name: "a choice outside the allowed options", model: "alien", message: /allowed options/ },
  ];
  for (const entry of cases) {
    test(entry.name, async () => {
      const adapter = new SelfHostedDecisionAdapter(base, entry.model, policy);
      await expect(adapter.decide(request({ options: ["urgent", "normal"] }))).rejects.toThrow(
        entry.message,
      );
    });
  }
});

describe("§5 timeouts, retries and quota handling", () => {
  test("a 429 is retried and then succeeds", async () => {
    flaky = { attempts: 0, mode: "rate-limited" };
    const body = await postJson(`${base}/flaky`, { a: 1 }, {}, policy);
    expect(body).toEqual({ ok: true });
    expect(flaky.attempts).toBe(2);
  });

  test("a 5xx is retried and then succeeds", async () => {
    flaky = { attempts: 0, mode: "server-error" };
    const body = await postJson(`${base}/flaky`, { a: 1 }, {}, policy);
    expect(body).toEqual({ ok: true });
    expect(flaky.attempts).toBe(2);
  });

  test("a 4xx rejection is never retried", async () => {
    flaky = { attempts: 0, mode: "reject" };
    await expect(postJson(`${base}/flaky`, { a: 1 }, {}, policy)).rejects.toThrow(UpstreamError);
    expect(flaky.attempts).toBe(1);
  });

  test("retries are bounded and the failure is classified", async () => {
    flaky = { attempts: 0, mode: "hang" };
    await expect(
      postJson(`${base}/flaky`, { a: 1 }, {}, { timeoutMs: 120, maxRetries: 1 }),
    ).rejects.toMatchObject({ failure: "timeout" });
    expect(flaky.attempts).toBe(2);
  });

  test("a rate-limited failure is classified as rate-limited", async () => {
    flaky = { attempts: 0, mode: "rate-limited" };
    await expect(
      postJson(`${base}/flaky`, { a: 1 }, {}, { timeoutMs: 1000, maxRetries: 0 }),
    ).rejects.toMatchObject({ failure: "rate-limited", status: 429 });
  });

  test("an unreachable host is classified as unavailable", async () => {
    await expect(
      postJson("http://127.0.0.1:1/v1/chat/completions", {}, {}, { timeoutMs: 200, maxRetries: 0 }),
    ).rejects.toMatchObject({ failure: "unavailable" });
  });
});

describe("provider adapter", () => {
  test("chat returns text and token usage", async () => {
    const adapter = new ProviderAdapter(base, "key", { timeoutMs: 1000, maxRetries: 0 });
    const completion = await adapter.chat({
      model: "m",
      maxTokens: 10,
      messages: [{ role: "user", content: "hola" }],
    });
    expect(completion.text).toBe("respuesta");
    expect(completion.usage).toEqual({ promptTokens: 11, completionTokens: 3 });
    expect(hits[hits.length - 1]?.authorization).toBe("Bearer key");
  });

  test("embed returns a numeric vector", async () => {
    const adapter = new ProviderAdapter(base, null, { timeoutMs: 1000, maxRetries: 0 });
    expect(await adapter.embed("m", "texto")).toEqual([0.5, 0.25]);
  });

  test("a malformed vector is rejected instead of returned", async () => {
    const adapter = new ProviderAdapter(base, null, { timeoutMs: 1000, maxRetries: 0 });
    await expect(adapter.embed("bad-vector", "texto")).rejects.toMatchObject({
      failure: "malformed",
    });
  });

  test("a local adapter sends no authorization header", async () => {
    const adapter = new ProviderAdapter(base, null, { timeoutMs: 1000, maxRetries: 0 });
    await adapter.chat({ model: "m", maxTokens: 1, messages: [{ role: "user", content: "x" }] });
    expect(hits[hits.length - 1]?.authorization).toBeNull();
  });
});

describe("upstream failures stay observable", () => {
  test("failures are counted by kind and cleared on reset", () => {
    const metrics = new AiObservabilityService();
    metrics.recordUpstreamFailure(new UpstreamError("rate-limited", "quota", 429));
    metrics.recordUpstreamFailure(new UpstreamError("unavailable", "down"));
    metrics.recordUpstreamFailure(new Error("unexpected"));
    expect(metrics.snapshot().upstreamFailures).toEqual({
      "rate-limited": 1,
      unavailable: 1,
      unknown: 1,
    });
    metrics.reset();
    expect(metrics.snapshot().upstreamFailures).toEqual({});
  });
});
