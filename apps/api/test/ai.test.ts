import "reflect-metadata";
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import { AiController } from "../src/ai/ai.controller";
import { AiService } from "../src/ai/ai.service";
import { RegistryService } from "../src/ai/registry.service";
import type { AIModelRow, AiStore, AuditInput, ObservationRow } from "../src/ai/store";
import { AI_STORE } from "../src/ai/tokens";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { RequestIdMiddleware } from "../src/request-id.middleware";

const TEST_SECRET = "test-secret-with-at-least-32-characters!!";
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

class FakeAuthStore implements AuthStore {
  users = new Map<string, UserRow>();
  sessions = new Map<string, SessionRow>();
  memberships = new Map<string, MembershipRow[]>();

  async findUserByEmail(email: string): Promise<UserRow | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }
  async findUserById(id: string): Promise<UserRow | null> {
    return this.users.get(id) ?? null;
  }
  async createSession(data: { userId: string; expiresAt: Date }): Promise<{ id: string }> {
    const id = `session-${this.sessions.size + 1}`;
    this.sessions.set(id, { id, userId: data.userId, expiresAt: data.expiresAt, rotatedAt: null });
    return { id };
  }
  async findSessionById(id: string): Promise<SessionRow | null> {
    return this.sessions.get(id) ?? null;
  }
  async touchSession(): Promise<void> {}
  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }
  async listMemberships(userId: string): Promise<MembershipRow[]> {
    return this.memberships.get(userId) ?? [];
  }
  async writeAuditEvent(): Promise<void> {}
}

class FakeAiStore implements AiStore {
  models = new Map<string, AIModelRow>();
  observations: ObservationRow[] = [];
  audits: AuditInput[] = [];

  async registerModel(data: {
    modelId: string;
    version: string;
    provider: string;
    runtime: string;
    quantization: string | null;
    capabilities: string[];
    contextSize: number | null;
    languages: string[];
    privacyTier: string;
    hardware: Record<string, unknown> | null;
  }): Promise<AIModelRow> {
    const row: AIModelRow = {
      id: `model-${this.models.size + 1}`,
      ...data,
      status: "candidate",
      score: null,
    };
    this.models.set(row.modelId, row);
    return row;
  }

  async listModels(filter: { status?: string; runtime?: string }): Promise<AIModelRow[]> {
    return [...this.models.values()].filter(
      (row) =>
        (filter.status === undefined || row.status === filter.status) &&
        (filter.runtime === undefined || row.runtime === filter.runtime),
    );
  }

  async findModel(modelId: string): Promise<AIModelRow | null> {
    return this.models.get(modelId) ?? null;
  }

  async setModelStatus(modelId: string, status: string): Promise<AIModelRow> {
    const found = this.models.get(modelId);
    if (!found) {
      throw new Error("model not found");
    }
    found.status = status;
    return found;
  }

  async setModelScore(modelId: string, score: number): Promise<AIModelRow> {
    const found = this.models.get(modelId);
    if (!found) {
      throw new Error("model not found");
    }
    found.score = score;
    return found;
  }

  async recordObservation(data: {
    orgId: string | null;
    modelId: string;
    questionType: string;
    confidence: number;
    correct: boolean;
  }): Promise<ObservationRow> {
    const row: ObservationRow = { id: `obs-${this.observations.length + 1}`, ...data };
    this.observations.push(row);
    return row;
  }

  async listObservations(modelId: string, questionType: string): Promise<ObservationRow[]> {
    return this.observations.filter(
      (row) => row.modelId === modelId && row.questionType === questionType,
    );
  }

  async writeAuditEvent(event: AuditInput): Promise<void> {
    this.audits.push(event);
  }
}

interface Seen {
  path: string;
  body: Record<string, unknown>;
}

function serveInference(server: { hits: Seen[] }) {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      server.hits.push({ path: url.pathname, body });
      if (url.pathname === "/v1/chat/completions") {
        const messages = body.messages as { content: unknown }[] | undefined;
        const first = messages?.[0]?.content;
        const text =
          typeof first === "string"
            ? first
            : Array.isArray(first)
              ? first
                  .map((part) =>
                    typeof (part as { text?: unknown }).text === "string"
                      ? (part as { text: string }).text
                      : "",
                  )
                  .join(" ")
              : "";
        if (text.includes("__vision__")) {
          return Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    description: "Tubería con fuga de agua bajo el lavaplatos.",
                    labels: ["plumbing", "leak"],
                  }),
                },
              },
            ],
          });
        }
        if (text.includes("__badshape__")) {
          return Response.json({
            choices: [{ message: { content: JSON.stringify({ urgency: 5, category: 7 }) } }],
          });
        }
        if (text.includes("__json__")) {
          return Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    category: "plumbing",
                    urgency: "high",
                    summary: "Fuga reportada en el bath.",
                  }),
                },
              },
            ],
          });
        }
        return Response.json({ choices: [{ message: { content: "Borrador local generado." } }] });
      }
      if (url.pathname === "/v1/embeddings") {
        return Response.json({ data: [{ embedding: [0.11, 0.22, 0.33] }] });
      }
      if (url.pathname === "/decide") {
        const question = String(body.question ?? "");
        return Response.json({
          choice: "urgent",
          confidence: question.includes("lowconf") ? 0.4 : 0.95,
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
}

const authStore = new FakeAuthStore();
const aiStore = new FakeAiStore();
const localServer = { hits: [] as Seen[] };
const providerServer = { hits: [] as Seen[] };
let local: ReturnType<typeof serveInference>;
let provider: ReturnType<typeof serveInference>;

@Module({
  controllers: [AuthController, AiController],
  providers: [
    AuthService,
    AiService,
    RegistryService,
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: AI_STORE, useValue: aiStore },
  ],
})
class AiTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, IdempotencyMiddleware).forRoutes("*");
  }
}

let app: INestApplication;
let baseUrl = "";
let token = "";

function headers(org = "org-a"): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "X-Org-Id": org, "Content-Type": "application/json" };
}

async function post(path: string, body: unknown, org?: string) {
  return fetch(`${baseUrl}/api/v1/ai/${path}`, {
    method: "POST",
    headers: org === undefined ? headers() : headers(org),
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  local = serveInference(localServer);
  provider = serveInference(providerServer);
  process.env.AI_ENABLED = "true";
  process.env.AI_WEBGPU_ENABLED = "true";
  process.env.AI_LOCAL_MODELS = "lfm2.5-1.2b";
  process.env.AI_LOCAL_BASE_URL = `http://127.0.0.1:${local.port}`;
  process.env.AI_EXTERNAL_PROVIDER = "";
  process.env.AI_PROVIDER_BASE_URL = "";
  process.env.AI_PROVIDER_API_KEY = "";
  process.env.AI_DECISION_PROVIDER = "laya";
  process.env.AI_DECISION_BASE_URL = `http://127.0.0.1:${local.port}`;
  process.env.AI_DECISION_MODEL = "laya-0.4b";

  authStore.users.set("user-1", {
    id: "user-1",
    email: "admin@ejemplo.co",
    passwordHash: hashPassword("correct-horse-1"),
    name: "Admin",
  });
  authStore.users.set("user-2", {
    id: "user-2",
    email: "lector@ejemplo.co",
    passwordHash: hashPassword("correct-horse-1"),
    name: "Lector",
  });
  authStore.memberships.set("user-1", [
    {
      orgId: "org-a",
      status: "ACTIVE",
      roleName: "admin",
      permissions: ["ai:read", "ai:write"],
    },
  ]);
  authStore.memberships.set("user-2", [
    { orgId: "org-a", status: "ACTIVE", roleName: "reader", permissions: ["ai:read"] },
  ]);
  app = await NestFactory.create(AiTestModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@ejemplo.co", password: "correct-horse-1" }),
  });
  token = ((await login.json()) as { accessToken: string }).accessToken;
});

afterAll(async () => {
  await app?.close();
  local.stop(true);
  provider.stop(true);
});

beforeEach(() => {
  localServer.hits.length = 0;
  providerServer.hits.length = 0;
  aiStore.audits.length = 0;
});

describe("WS-11 authorization on the AI gateway", () => {
  test("rejects unauthenticated access", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ai/status`);
    expect(response.status).toBe(403);
  });

  test("denies a caller without ai:write", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ai/status`, {
      headers: { Authorization: `Bearer ${token}`, "X-Org-Id": "org-a" },
    });
    expect(response.status).toBe(200);
    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lector@ejemplo.co", password: "correct-horse-1" }),
    });
    const readerToken = ((await login.json()) as { accessToken: string }).accessToken;
    const denied = await fetch(`${baseUrl}/api/v1/ai/text`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readerToken}`,
        "X-Org-Id": "org-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ feature: "draft", prompt: "hola", dataClasses: ["PUBLIC"] }),
    });
    expect(denied.status).toBe(403);
  });

  test("denies an org the caller has no membership in", async () => {
    const response = await post(
      "text",
      { feature: "draft", prompt: "hola", dataClasses: ["PUBLIC"] },
      "org-b",
    );
    expect(response.status).toBe(403);
  });
});

describe("gateway status and modes", () => {
  test("status reports configuration without secrets", async () => {
    const body = (await (
      await fetch(`${baseUrl}/api/v1/ai/status`, { headers: headers() })
    ).json()) as {
      enabled: boolean;
      localModels: string[];
      serverAvailable: Record<string, boolean>;
      decision: { provider: string; model: string };
      limits: { timeoutMs: number };
    };
    expect(body.enabled).toBe(true);
    expect(body.localModels).toEqual(["lfm2.5-1.2b"]);
    expect(body.serverAvailable.local).toBe(true);
    expect(body.serverAvailable.provider).toBe(false);
    expect(body.decision.provider).toBe("laya");
    expect(body.limits.timeoutMs).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain("API_KEY");
    expect(JSON.stringify(body)).not.toContain("test-secret");
  });

  test("modes expose all five modes and keep local-only data off providers", async () => {
    const body = (await (
      await fetch(`${baseUrl}/api/v1/ai/modes`, { headers: headers() })
    ).json()) as {
      modes: string[];
      defaultPriority: string[];
      privacy: Record<string, string[]>;
      decideThresholds: Partial<Record<string, number>>;
    };
    expect(body.modes).toEqual(["disabled", "webgpu", "local", "hybrid", "provider"]);
    expect(body.defaultPriority).toEqual(["webgpu", "local", "provider", "disabled"]);
    expect(body.privacy["local-only"]).not.toContain("provider");
    const dunning = body.decideThresholds.dunning ?? 0;
    const triage = body.decideThresholds.triage ?? 0;
    expect(dunning).toBeGreaterThan(triage);
  });
});

describe("§1 gateway surface", () => {
  test("generateText runs on the local runtime and audits the call", async () => {
    const body = (await (
      await post("text", {
        feature: "document-draft",
        prompt: "Redacta un recibo de arriendo.",
        dataClasses: ["INTERNAL"],
        mode: "local",
      })
    ).json()) as { available: boolean; runtime: string; model: string; text: string };
    expect(body.available).toBe(true);
    expect(body.runtime).toBe("local");
    expect(body.model).toBe("lfm2.5-1.2b");
    expect(body.text).toBe("Borrador local generado.");
    expect(aiStore.audits.map((entry) => entry.action)).toContain("ai.call");
    expect(localServer.hits.map((hit) => hit.path)).toContain("/v1/chat/completions");
  });

  test("generateStructuredOutput returns schema-validated data", async () => {
    const body = (await (
      await post("structured", {
        feature: "extraction",
        prompt: "__json__",
        schema: {
          type: "object",
          required: ["category", "urgency"],
          properties: {
            category: { type: "string" },
            urgency: { type: "string", enum: ["low", "high"] },
            summary: { type: "string" },
          },
        },
        dataClasses: ["PUBLIC"],
        mode: "local",
      })
    ).json()) as { available: boolean; data: Record<string, unknown> };
    expect(body.available).toBe(true);
    expect(body.data.category).toBe("plumbing");
    expect(body.data.urgency).toBe("high");
  });

  test("structured output that violates the schema is rejected, not used", async () => {
    const response = await post("structured", {
      feature: "extraction",
      prompt: "__badshape__",
      schema: {
        type: "object",
        required: ["category", "urgency"],
        properties: {
          category: { type: "string" },
          urgency: { type: "string" },
        },
      },
      dataClasses: ["PUBLIC"],
      mode: "local",
    });
    expect(response.status).toBe(502);
  });

  test("generateEmbedding returns a numeric vector", async () => {
    const body = (await (
      await post("embeddings", {
        feature: "knowledge",
        text: "Contrato de arrendamiento es-CO",
        dataClasses: ["PUBLIC"],
        mode: "local",
      })
    ).json()) as { available: boolean; embedding: number[] };
    expect(body.available).toBe(true);
    expect(body.embedding).toEqual([0.11, 0.22, 0.33]);
  });

  test("analyzeImage returns a validated vision result", async () => {
    const body = (await (
      await post("vision", {
        feature: "vision",
        prompt: "__vision__ Describe la imagen.",
        image: { mediaType: "image/png", base64: PNG_BASE64 },
        dataClasses: ["PUBLIC"],
        mode: "local",
      })
    ).json()) as { available: boolean; analysis: { description: string; labels: string[] } };
    expect(body.available).toBe(true);
    expect(body.analysis.description).toContain("Tubería");
    expect(body.analysis.labels).toEqual(["plumbing", "leak"]);
  });

  test("analyzeImage rejects an unsupported media type", async () => {
    const response = await post("vision", {
      feature: "vision",
      prompt: "Describe.",
      image: { mediaType: "application/x-msdownload", base64: PNG_BASE64 },
      dataClasses: ["PUBLIC"],
    });
    expect(response.status).toBe(400);
  });
});

describe("§1 decide with calibrated confidence", () => {
  test("a confident typed choice does not escalate", async () => {
    const body = (await (
      await post("decide", {
        feature: "maintenance-triage",
        question: "¿Urgente?",
        questionType: "triage",
        options: ["urgent", "normal"],
        dataClasses: ["PUBLIC"],
      })
    ).json()) as {
      kind: string;
      choice: string;
      confidence: number;
      escalated: boolean;
      threshold: number;
    };
    expect(body.kind).toBe("choice");
    expect(body.choice).toBe("urgent");
    expect(body.confidence).toBeCloseTo(0.95, 2);
    expect(body.escalated).toBe(false);
    expect(body.threshold).toBe(0.8);
  });

  test("a low-confidence answer escalates to a human instead of advancing", async () => {
    const body = (await (
      await post("decide", {
        feature: "maintenance-triage",
        question: "lowconf ¿urgente?",
        questionType: "triage",
        dataClasses: ["PUBLIC"],
      })
    ).json()) as { kind: string; confidence: number; escalated: boolean };
    expect(body.kind).toBe("choice");
    expect(body.confidence).toBeLessThan(0.8);
    expect(body.escalated).toBe(true);
  });

  test("dunning uses a stricter threshold than triage", async () => {
    const body = (await (
      await post("decide", {
        feature: "dunning-stage",
        question: "¿Escalar a cobranza?",
        questionType: "dunning",
        dataClasses: ["PUBLIC"],
      })
    ).json()) as { threshold: number };
    expect(body.threshold).toBe(0.9);
  });
});

describe("§8 privacy policy on the gateway", () => {
  test("financial data never reaches a provider even when provider mode is requested", async () => {
    process.env.AI_EXTERNAL_PROVIDER = "openai-compatible";
    process.env.AI_PROVIDER_BASE_URL = `http://127.0.0.1:${provider.port}`;
    const response = await post("text", {
      feature: "ledger-summary",
      prompt: "Resume el estado de cuenta del inquilino.",
      dataClasses: ["FINANCIAL"],
      mode: "provider",
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { available: boolean; runtime?: string };
    expect(body.available).toBe(false);
    expect(providerServer.hits).toHaveLength(0);
  });

  test("internal data prefers local while a provider is configured", async () => {
    const body = (await (
      await post("text", {
        feature: "summarization",
        prompt: "Resume el historial de mantenimiento.",
        dataClasses: ["INTERNAL"],
        mode: "hybrid",
      })
    ).json()) as { available: boolean; runtime: string };
    expect(body.runtime).toBe("local");
    expect(providerServer.hits).toHaveLength(0);
  });

  test("personal data sent to a provider is redacted first", async () => {
    process.env.AI_EXTERNAL_PROVIDER = "openai-compatible";
    process.env.AI_PROVIDER_BASE_URL = `http://127.0.0.1:${provider.port}`;
    const body = (await (
      await post("text", {
        feature: "communication-assist",
        prompt: "Avisa a ana@ejemplo.co al 300 123 4567.",
        dataClasses: ["PUBLIC"],
        mode: "provider",
      })
    ).json()) as { available: boolean; runtime: string };
    expect(body.runtime).toBe("provider");
    const sent = providerServer.hits[0]?.body.messages as { content: string }[] | undefined;
    const content = sent?.[0]?.content ?? "";
    expect(content).toContain("[email]");
    expect(content).not.toContain("ana@ejemplo.co");
  });
});

describe("§2 execution modes and the graceful non-AI path", () => {
  test("AI_ENABLED=false degrades to a non-AI path instead of failing", async () => {
    process.env.AI_ENABLED = "false";
    const text = (await (
      await post("text", {
        feature: "document-draft",
        prompt: "Redacta un recibo.",
        dataClasses: ["PUBLIC"],
      })
    ).json()) as { available: boolean; reason: string };
    expect(text.available).toBe(false);
    expect(text.reason).toMatch(/disabled|permitted/i);
    expect(localServer.hits).toHaveLength(0);

    const structured = (await (
      await post("structured", {
        feature: "extraction",
        prompt: "Extrae.",
        schema: {
          type: "object",
          required: ["category"],
          properties: { category: { type: "string" } },
        },
        dataClasses: ["PUBLIC"],
      })
    ).json()) as { available: boolean };
    expect(structured.available).toBe(false);

    const decision = (await (
      await post("decide", {
        feature: "triage",
        question: "¿Urgente?",
        questionType: "triage",
        dataClasses: ["PUBLIC"],
      })
    ).json()) as { kind: string; escalated: boolean; confidence: number };
    expect(decision.kind).toBe("none");
    expect(decision.escalated).toBe(true);
    expect(decision.confidence).toBe(0);
    process.env.AI_ENABLED = "true";
  });

  test("webgpu-only mode defers to the client with a payload", async () => {
    const body = (await (
      await post("text", {
        feature: "document-draft",
        prompt: "Redacta en el dispositivo.",
        dataClasses: ["PUBLIC"],
        mode: "webgpu",
        clientWebgpu: true,
      })
    ).json()) as {
      available: boolean;
      runtime: string;
      deferred: boolean;
      payload?: Record<string, unknown>;
    };
    expect(body.available).toBe(true);
    expect(body.runtime).toBe("webgpu");
    expect(body.deferred).toBe(true);
    expect(body.payload?.["prompt"]).toBe("Redacta en el dispositivo.");
  });

  test("webgpu is not offered when the client reports no WebGPU support", async () => {
    const body = (await (
      await post("text", {
        feature: "document-draft",
        prompt: "Redacta.",
        dataClasses: ["PUBLIC"],
        mode: "webgpu",
        clientWebgpu: false,
      })
    ).json()) as { available: boolean; reason: string };
    expect(body.available).toBe(false);
  });

  test("a client-executed result is accepted through the validation endpoint", async () => {
    const body = (await (
      await post("complete", {
        feature: "document-draft",
        result: "Texto ejecutado en WebGPU.",
        model: "lfm2.5-1.2b",
      })
    ).json()) as { text: string; model: string };
    expect(body.text).toBe("Texto ejecutado en WebGPU.");
    expect(aiStore.audits.map((entry) => entry.action)).toContain("ai.call");
  });

  test("an unreachable endpoint surfaces as 502, not a crash", async () => {
    process.env.AI_LOCAL_BASE_URL = "http://127.0.0.1:1";
    const response = await post("text", {
      feature: "document-draft",
      prompt: "Redacta.",
      dataClasses: ["PUBLIC"],
      mode: "local",
    });
    expect(response.status).toBe(502);
    process.env.AI_LOCAL_BASE_URL = `http://127.0.0.1:${local.port}`;
  });
});

describe("§6 model registry lifecycle", () => {
  test("registers a model as candidate and refuses duplicates", async () => {
    const created = await post("models", {
      modelId: "lfm2.5-1.2b",
      version: "1.2.0",
      provider: "liquid",
      runtime: "local",
      capabilities: ["text", "embedding"],
      languages: ["es", "en"],
      privacyTier: "local-only",
    });
    expect(created.status).toBe(201);
    const row = (await created.json()) as { id: string; status: string };
    expect(row.status).toBe("candidate");

    const duplicate = await post("models", {
      modelId: "lfm2.5-1.2b",
      version: "1.2.0",
      provider: "liquid",
      runtime: "local",
    });
    expect(duplicate.status).toBe(409);
  });

  test("rejects an unknown runtime", async () => {
    const response = await post("models", {
      modelId: "otro-model",
      version: "1.0.0",
      provider: "x",
      runtime: "quantum",
    });
    expect(response.status).toBe(400);
  });

  test("lifecycle advances one stage at a time and never auto-deploys", async () => {
    const skip = await fetch(`${baseUrl}/api/v1/ai/models/lfm2.5-1.2b/transitions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ to: "active" }),
    });
    expect(skip.status).toBe(400);

    for (const to of ["installed", "evaluated", "approved", "active"]) {
      const step = await fetch(`${baseUrl}/api/v1/ai/models/lfm2.5-1.2b/transitions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ to }),
      });
      expect(step.status).toBe(201);
    }
    const listed = (await (
      await fetch(`${baseUrl}/api/v1/ai/models?status=active`, { headers: headers() })
    ).json()) as { modelId: string; status: string }[];
    expect(listed.map((row) => row.modelId)).toContain("lfm2.5-1.2b");
    expect(aiStore.audits.map((entry) => entry.action)).toContain("ai.model_status_changed");
  });

  test("a deprecated model cannot be reactivated", async () => {
    const deprecate = await fetch(`${baseUrl}/api/v1/ai/models/lfm2.5-1.2b/transitions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ to: "deprecated" }),
    });
    expect(deprecate.status).toBe(201);
    const revive = await fetch(`${baseUrl}/api/v1/ai/models/lfm2.5-1.2b/transitions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ to: "installed" }),
    });
    expect(revive.status).toBe(400);
  });

  test("an evaluation score is only accepted once the model is evaluated", async () => {
    await post("models", {
      modelId: "laya-0.4b",
      version: "0.4.0",
      provider: "self-hosted",
      runtime: "local",
      languages: ["es"],
      privacyTier: "local-only",
    });
    const tooEarly = await fetch(`${baseUrl}/api/v1/ai/models/laya-0.4b/evaluations`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ score: 0.82 }),
    });
    expect(tooEarly.status).toBe(400);

    for (const to of ["installed", "evaluated"]) {
      await fetch(`${baseUrl}/api/v1/ai/models/laya-0.4b/transitions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ to }),
      });
    }
    const scored = await fetch(`${baseUrl}/api/v1/ai/models/laya-0.4b/evaluations`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ score: 0.82 }),
    });
    expect(scored.status).toBe(201);
    const row = (await scored.json()) as { score: number; status: string };
    expect(row.score).toBeCloseTo(0.82, 5);
    expect(row.status).toBe("evaluated");
    expect(aiStore.audits.map((entry) => entry.action)).toContain("ai.model_evaluated");
  });

  test("an out-of-range evaluation score is rejected", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ai/models/laya-0.4b/evaluations`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ score: 4.2 }),
    });
    expect(response.status).toBe(400);
  });

  test("a score for an unknown model is a 404", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ai/models/no-existe/evaluations`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ score: 0.5 }),
    });
    expect(response.status).toBe(404);
  });
});

describe("§11 decision calibration gate", () => {
  test("records outcomes and reports a fitted temperature and ECE", async () => {
    for (const sample of [
      { confidence: 0.95, correct: true },
      { confidence: 0.92, correct: true },
      { confidence: 0.2, correct: false },
      { confidence: 0.1, correct: false },
    ]) {
      const response = await post("observations", {
        modelId: "laya-0.4b",
        questionType: "triage",
        ...sample,
      });
      expect(response.status).toBe(201);
    }
    const body = (await (
      await fetch(`${baseUrl}/api/v1/ai/calibration?modelId=laya-0.4b&questionType=triage`, {
        headers: headers(),
      })
    ).json()) as {
      samples: number;
      temperature: number;
      ece: number;
      calibratedEce: number;
    };
    expect(body.samples).toBe(4);
    expect(body.temperature).toBeGreaterThan(0);
    expect(body.calibratedEce).toBeLessThanOrEqual(body.ece + 0.0001);
    expect(aiStore.audits.map((entry) => entry.action)).toContain("ai.observation_recorded");
  });

  test("an out-of-range confidence is rejected", async () => {
    const response = await post("observations", {
      modelId: "laya-0.4b",
      questionType: "triage",
      confidence: 1.4,
      correct: true,
    });
    expect(response.status).toBe(400);
  });
});
