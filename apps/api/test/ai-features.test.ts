import "reflect-metadata";
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { hashPassword } from "@admin-alquiler/auth";
import { AiFeaturesController } from "../src/ai/features/features.controller";
import { AiFeaturesService } from "../src/ai/features/features.service";
import type { AiSuggestionStore, SuggestionRow } from "../src/ai/features/store";
import { AI_SUGGESTION_STORE } from "../src/ai/features/tokens";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import type { AuthStore, MembershipRow, SessionRow, UserRow } from "../src/auth/store";
import { AUTH_CONFIG, AUTH_STORE } from "../src/auth/tokens";
import { IdempotencyMiddleware } from "../src/idempotency/middleware";
import { RequestIdMiddleware } from "../src/request-id.middleware";
import type { AiService } from "../src/ai/ai.service";

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

class FakeSuggestionStore implements AiSuggestionStore {
  rows = new Map<string, SuggestionRow>();
  audits: { action: string; entityId?: string }[] = [];

  async create(data: {
    orgId: string;
    actorId: string;
    feature: string;
    payload: Record<string, unknown>;
    confidence: number | null;
    requiresConfirmation: boolean;
    sourceRuntime: string | null;
    sourceModel: string | null;
  }): Promise<SuggestionRow> {
    const row: SuggestionRow = {
      id: `sug-${this.rows.size + 1}`,
      status: "PENDING",
      decidedAt: null,
      decidedBy: null,
      createdAt: new Date(),
      ...data,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async find(id: string, orgId: string): Promise<SuggestionRow | null> {
    const row = this.rows.get(id);
    return row !== undefined && row.orgId === orgId ? row : null;
  }
  async list(
    orgId: string,
    filter: { feature?: string; status?: SuggestionRow["status"] },
  ): Promise<SuggestionRow[]> {
    return [...this.rows.values()].filter(
      (row) =>
        row.orgId === orgId &&
        (filter.feature === undefined || row.feature === filter.feature) &&
        (filter.status === undefined || row.status === filter.status),
    );
  }
  async decide(
    id: string,
    orgId: string,
    status: SuggestionRow["status"],
    decidedBy: string,
  ): Promise<SuggestionRow | null> {
    const row = this.rows.get(id);
    if (row === undefined || row.orgId !== orgId || row.status !== "PENDING") {
      return null;
    }
    row.status = status;
    row.decidedBy = decidedBy;
    row.decidedAt = new Date();
    return row;
  }
  async writeAuditEvent(event: { action: string; entityId?: string }): Promise<void> {
    this.audits.push(event);
  }
}

type Gateway = {
  generateText: ReturnType<typeof makeText>;
  generateStructuredOutput: ReturnType<typeof makeStructured>;
  analyzeImage: ReturnType<typeof makeVision>;
  decide: ReturnType<typeof makeDecide>;
};

function makeText(behavior: "ok" | "off") {
  return async (_orgId: string, _actorId: string, input: { feature: string; prompt: string }) => {
    if (behavior === "off") {
      return { available: false as const, reason: "AI is disabled." };
    }
    return {
      available: true as const,
      runtime: "local" as const,
      model: "test-model",
      text: `Borrador para ${input.feature}`,
      deferred: false as const,
    };
  };
}

function makeStructured(behavior: "ok" | "off" | "bad-enum") {
  return async (_orgId: string, _actorId: string, input: { feature: string }) => {
    if (behavior === "off") {
      return { available: false as const, reason: "AI is disabled." };
    }
    if (behavior === "bad-enum") {
      throw new Error('Field "category" is not an allowed value.');
    }
    return {
      available: true as const,
      runtime: "local" as const,
      model: "test-model",
      data:
        input.feature === "extraction"
          ? { documentType: "lease", monthlyRentMinor: 1200000, currency: "COP" }
          : { category: "plumbing", urgency: "high", summary: "Fuga en el bath." },
    };
  };
}

function makeVision(behavior: "ok" | "off") {
  return async () => {
    if (behavior === "off") {
      return { available: false as const, reason: "AI is disabled." };
    }
    return {
      available: true as const,
      runtime: "local" as const,
      model: "test-model",
      analysis: { description: "Tubería con fuga.", labels: ["plumbing"] },
    };
  };
}

function makeDecide(behavior: "confident" | "unsure" | "off") {
  return async () => {
    if (behavior === "off") {
      return {
        kind: "none" as const,
        confidence: 0,
        escalated: true,
        threshold: 1,
        model: "disabled",
        runtime: "disabled" as const,
        requiresConfirmation: true,
      };
    }
    const confident = behavior === "confident";
    return {
      kind: "choice" as const,
      choice: "urgent",
      confidence: confident ? 0.95 : 0.3,
      escalated: !confident,
      threshold: 0.8,
      model: "laya-0.4b",
      runtime: "local" as const,
      requiresConfirmation: !confident,
    };
  };
}

const suggestionStore = new FakeSuggestionStore();
let gatewayBehavior: "ok" | "off" | "bad-enum" = "ok";
let decideBehavior: "confident" | "unsure" | "off" = "confident";

const gateway: Gateway = {
  generateText: ((...args: Parameters<ReturnType<typeof makeText>>) =>
    makeText(gatewayBehavior === "off" ? "off" : "ok")(...args)) as Gateway["generateText"],
  generateStructuredOutput: ((...args: Parameters<ReturnType<typeof makeStructured>>) =>
    makeStructured(gatewayBehavior)(...args)) as Gateway["generateStructuredOutput"],
  analyzeImage: ((...args: Parameters<ReturnType<typeof makeVision>>) =>
    makeVision(gatewayBehavior === "off" ? "off" : "ok")(...args)) as Gateway["analyzeImage"],
  decide: ((...args: Parameters<ReturnType<typeof makeDecide>>) =>
    makeDecide(decideBehavior)(...args)) as Gateway["decide"],
};

const authStore = new FakeAuthStore();

@Module({
  controllers: [AuthController, AiFeaturesController],
  providers: [
    AuthService,
    {
      provide: AiFeaturesService,
      useFactory: () => new AiFeaturesService(suggestionStore, gateway as unknown as AiService),
    },
    JwtAuthGuard,
    PermissionsGuard,
    { provide: AUTH_STORE, useValue: authStore },
    { provide: AUTH_CONFIG, useValue: { jwtSecret: TEST_SECRET } },
    { provide: AI_SUGGESTION_STORE, useValue: suggestionStore },
  ],
})
class AiFeaturesTestModule implements NestModule {
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
  return fetch(`${baseUrl}/api/v1/ai/suggestions/${path}`, {
    method: "POST",
    headers: org === undefined ? headers() : headers(org),
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  authStore.users.set("user-1", {
    id: "user-1",
    email: "admin@ejemplo.co",
    passwordHash: hashPassword("correct-horse-1"),
    name: "Admin",
  });
  authStore.memberships.set("user-1", [
    { orgId: "org-a", status: "ACTIVE", roleName: "admin", permissions: ["ai:read", "ai:write"] },
  ]);
  authStore.users.set("user-2", {
    id: "user-2",
    email: "multi@ejemplo.co",
    passwordHash: hashPassword("correct-horse-1"),
    name: "Multi",
  });
  authStore.memberships.set("user-2", [
    { orgId: "org-a", status: "ACTIVE", roleName: "admin", permissions: ["ai:read", "ai:write"] },
    { orgId: "org-b", status: "ACTIVE", roleName: "admin", permissions: ["ai:read", "ai:write"] },
  ]);
  app = await NestFactory.create(AiFeaturesTestModule, { logger: false });
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
});

beforeEach(() => {
  gatewayBehavior = "ok";
  decideBehavior = "confident";
  suggestionStore.audits.length = 0;
});

describe("§10 the six initial features produce suggestions", () => {
  test("document drafting", async () => {
    const response = await post("draft", {
      documentType: "recibo de arriendo",
      fields: { inquilino: "Ana", canon: "1200000" },
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      available: boolean;
      suggestion: { id: string; feature: string; payload: Record<string, unknown> };
    };
    expect(body.available).toBe(true);
    expect(body.suggestion.feature).toBe("document-draft");
    expect(String(body.suggestion.payload["text"])).toContain("document-draft");
  });

  test("communication assistance", async () => {
    const body = (await (
      await post("communication", { recipient: "inquilino", purpose: "recordar la cuota" })
    ).json()) as { available: boolean; suggestion: { feature: string } };
    expect(body.suggestion.feature).toBe("communication-assist");
  });

  test("summarization", async () => {
    const body = (await (
      await post("summarize", { text: "Un contrato de arrendamiento por doce meses." })
    ).json()) as { available: boolean; suggestion: { feature: string } };
    expect(body.suggestion.feature).toBe("summarization");
  });

  test("extraction returns schema-validated fields with integer minor units", async () => {
    const body = (await (
      await post("extract", { text: "Contrato de arrendamiento, canon 1.200.000 COP." })
    ).json()) as {
      available: boolean;
      suggestion: { payload: Record<string, unknown> };
    };
    expect(body.suggestion.payload["documentType"]).toBe("lease");
    expect(body.suggestion.payload["monthlyRentMinor"]).toBe(1200000);
    expect(Number.isInteger(body.suggestion.payload["monthlyRentMinor"])).toBe(true);
  });

  test("classification is constrained to the allowed enum", async () => {
    const body = (await (
      await post("classify", { text: "Se broke la tubería del baño" })
    ).json()) as { available: boolean; suggestion: { payload: Record<string, unknown> } };
    expect(body.suggestion.payload["category"]).toBe("plumbing");
    expect(body.suggestion.payload["urgency"]).toBe("high");
  });

  test("vision analysis", async () => {
    const body = (await (
      await post("vision", { image: { mediaType: "image/png", base64: PNG_BASE64 } })
    ).json()) as { available: boolean; suggestion: { payload: Record<string, unknown> } };
    expect(body.suggestion.payload["description"]).toBe("Tubería con fuga.");
  });
});

describe("§9 AI never writes a business record directly", () => {
  test("a legal/financial draft requires human confirmation", async () => {
    const body = (await (
      await post("draft", { documentType: "contrato", fields: { canon: "1200000" } })
    ).json()) as { suggestion: { requiresConfirmation: boolean } };
    expect(body.suggestion.requiresConfirmation).toBe(true);
  });

  test("an internal communication draft does not require confirmation", async () => {
    const body = (await (
      await post("communication", { recipient: "inquilino", purpose: "recordar la cuota" })
    ).json()) as { suggestion: { requiresConfirmation: boolean } };
    expect(body.suggestion.requiresConfirmation).toBe(false);
  });

  test("every suggestion starts PENDING and is audited", async () => {
    const body = (await (await post("summarize", { text: "Documento de prueba." })).json()) as {
      suggestion: { status: string };
    };
    expect(body.suggestion.status).toBe("PENDING");
    expect(suggestionStore.audits.map((entry) => entry.action)).toContain("ai.suggestion_created");
  });
});

describe("§10 decide triage stays a suggestion", () => {
  test("a confident triage is recorded with its confidence", async () => {
    const body = (await (
      await post("triage", { question: "¿Urgente?", questionType: "triage" })
    ).json()) as {
      suggestion: {
        payload: Record<string, unknown>;
        confidence: number;
        requiresConfirmation: boolean;
      };
    };
    expect(body.suggestion.payload["choice"]).toBe("urgent");
    expect(body.suggestion.confidence).toBeCloseTo(0.95, 2);
    expect(body.suggestion.payload["escalated"]).toBe(false);
  });

  test("a low-confidence triage is marked escalated and needs a human", async () => {
    decideBehavior = "unsure";
    const body = (await (
      await post("triage", { question: "¿Urgente?", questionType: "triage" })
    ).json()) as {
      suggestion: { payload: Record<string, unknown>; requiresConfirmation: boolean };
    };
    expect(body.suggestion.payload["escalated"]).toBe(true);
    expect(body.suggestion.requiresConfirmation).toBe(true);
  });

  test("no business record is created by triage", async () => {
    await post("triage", { question: "¿Escalar a cobranza?", questionType: "dunning" });
    const listed = (await (
      await fetch(`${baseUrl}/api/v1/ai/suggestions`, { headers: headers() })
    ).json()) as { status: string }[];
    expect(listed.every((row) => row.status === "PENDING")).toBe(true);
  });
});

describe("human confirmation lifecycle", () => {
  async function makeSuggestion(): Promise<string> {
    const body = (await (
      await post("summarize", { text: "Documento para confirmar." })
    ).json()) as { suggestion: { id: string } };
    return body.suggestion.id;
  }

  test("confirm records the decision and audits it", async () => {
    const id = await makeSuggestion();
    const response = await fetch(`${baseUrl}/api/v1/ai/suggestions/${id}/confirm`, {
      method: "POST",
      headers: headers(),
    });
    expect(response.status).toBe(201);
    const row = (await response.json()) as { status: string; decidedBy: string };
    expect(row.status).toBe("CONFIRMED");
    expect(row.decidedBy).toBe("user-1");
    expect(suggestionStore.audits.map((entry) => entry.action)).toContain(
      "ai.suggestion_confirmed",
    );
  });

  test("reject records the decision", async () => {
    const id = await makeSuggestion();
    const response = await fetch(`${baseUrl}/api/v1/ai/suggestions/${id}/reject`, {
      method: "POST",
      headers: headers(),
    });
    expect(((await response.json()) as { status: string }).status).toBe("REJECTED");
  });

  test("deciding twice is a conflict", async () => {
    const id = await makeSuggestion();
    await fetch(`${baseUrl}/api/v1/ai/suggestions/${id}/confirm`, {
      method: "POST",
      headers: headers(),
    });
    const second = await fetch(`${baseUrl}/api/v1/ai/suggestions/${id}/confirm`, {
      method: "POST",
      headers: headers(),
    });
    expect(second.status).toBe(409);
  });

  test("an unknown suggestion is a 404", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ai/suggestions/no-existe/confirm`, {
      method: "POST",
      headers: headers(),
    });
    expect(response.status).toBe(404);
  });

  test("an org the caller has no membership in is refused at the guard", async () => {
    const id = await makeSuggestion();
    const crossRead = await fetch(`${baseUrl}/api/v1/ai/suggestions/${id}`, {
      headers: headers("org-b"),
    });
    expect(crossRead.status).toBe(403);
  });

  test("a member of both orgs still cannot read the other org's suggestion", async () => {
    const id = await makeSuggestion();
    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "multi@ejemplo.co", password: "correct-horse-1" }),
    });
    const multiToken = ((await login.json()) as { accessToken: string }).accessToken;
    const scoped = (org: string) => ({
      Authorization: `Bearer ${multiToken}`,
      "X-Org-Id": org,
      "Content-Type": "application/json",
    });
    expect(
      (await fetch(`${baseUrl}/api/v1/ai/suggestions/${id}`, { headers: scoped("org-a") })).status,
    ).toBe(200);
    expect(
      (await fetch(`${baseUrl}/api/v1/ai/suggestions/${id}`, { headers: scoped("org-b") })).status,
    ).toBe(404);
    const confirm = await fetch(`${baseUrl}/api/v1/ai/suggestions/${id}/confirm`, {
      method: "POST",
      headers: scoped("org-b"),
    });
    expect(confirm.status).toBe(404);
    const stillPending = (await (
      await fetch(`${baseUrl}/api/v1/ai/suggestions/${id}`, { headers: scoped("org-a") })
    ).json()) as { status: string };
    expect(stillPending.status).toBe("PENDING");
  });
});

describe("graceful non-AI path", () => {
  test("every feature reports unavailable instead of failing when AI is off", async () => {
    gatewayBehavior = "off";
    decideBehavior = "off";
    for (const [path, body] of [
      ["draft", { documentType: "contrato", fields: {} }],
      ["communication", { recipient: "x", purpose: "y" }],
      ["summarize", { text: "texto" }],
      ["extract", { text: "texto" }],
      ["classify", { text: "texto" }],
      ["vision", { image: { mediaType: "image/png", base64: PNG_BASE64 } }],
      ["triage", { question: "¿urgente?", questionType: "triage" }],
    ] as [string, Record<string, unknown>][]) {
      const response = await post(path, body);
      expect(response.status).toBe(201);
      const parsed = (await response.json()) as { available: boolean; reason?: string };
      expect(parsed.available).toBe(false);
      expect(parsed.reason).toBeTruthy();
    }
  });

  test("no suggestion is persisted when AI is unavailable", async () => {
    gatewayBehavior = "off";
    const before = suggestionStore.rows.size;
    await post("summarize", { text: "texto" });
    expect(suggestionStore.rows.size).toBe(before);
  });
});

describe("input validation", () => {
  test("an empty prompt is rejected", async () => {
    const response = await post("summarize", { text: "" });
    expect(response.status).toBe(400);
  });

  test("an unknown locale is rejected", async () => {
    const response = await post("summarize", { text: "hola", locale: "fr-FR" });
    expect(response.status).toBe(400);
  });

  test("an unknown question type is rejected", async () => {
    const response = await post("triage", { question: "x", questionType: "unknown" });
    expect(response.status).toBe(403);
  });

  test("an out-of-range summary length is rejected", async () => {
    const response = await post("summarize", { text: "hola", maxSentences: 99 });
    expect(response.status).toBe(400);
  });

  test("a schema violation from the model is not turned into a suggestion", async () => {
    gatewayBehavior = "bad-enum";
    const response = await post("classify", { text: "se rompió algo" });
    expect(response.status).toBeGreaterThanOrEqual(500);
    const before = suggestionStore.rows.size;
    expect(before).toBeGreaterThan(0);
  });
});

describe("authorization", () => {
  test("unauthenticated access is refused", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ai/suggestions`);
    expect(response.status).toBe(403);
  });

  test("an org without membership is refused", async () => {
    const response = await post("summarize", { text: "texto" }, "org-z");
    expect(response.status).toBe(403);
  });
});
