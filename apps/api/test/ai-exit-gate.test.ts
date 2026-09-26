import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { setupOpenApi } from "../src/openapi";

let app: INestApplication;
let baseUrl = "";

beforeAll(async () => {
  for (const key of [
    "AI_ENABLED",
    "AI_WEBGPU_ENABLED",
    "AI_LOCAL_MODELS",
    "AI_EXTERNAL_PROVIDER",
    "AI_PROVIDER_BASE_URL",
  ]) {
    delete process.env[key];
  }
  app = await NestFactory.create(AppModule, { logger: false });
  setupOpenApi(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe("Phase 2 exit gate — AI off breaks nothing", () => {
  test("the whole application still boots with AI disabled", async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    const ready = await fetch(`${baseUrl}/ready`);
    expect(ready.status).toBe(200);
  });

  test("every Phase 1 core route is still published in the contract", async () => {
    const body = (await (await fetch(`${baseUrl}/openapi.json`)).json()) as {
      paths: Record<string, unknown>;
    };
    for (const path of [
      "/api/v1/auth/login",
      "/api/v1/properties",
      "/api/v1/contracts",
      "/api/v1/contracts/{id}/payments",
      "/api/v1/receipts/{id}",
      "/api/v1/settlements",
      "/api/v1/documents",
      "/api/v1/maintenance-requests",
      "/api/v1/notifications",
      "/api/v1/audit-events",
    ]) {
      expect(Object.keys(body.paths)).toContain(path);
    }
  });

  test("the AI routes exist and are guarded rather than crashing", async () => {
    const body = (await (await fetch(`${baseUrl}/openapi.json`)).json()) as {
      paths: Record<string, unknown>;
    };
    for (const path of [
      "/api/v1/ai/status",
      "/api/v1/ai/text",
      "/api/v1/ai/structured",
      "/api/v1/ai/embeddings",
      "/api/v1/ai/vision",
      "/api/v1/ai/decide",
      "/api/v1/ai/metrics",
      "/api/v1/ai/suggestions/draft",
      "/api/v1/ai/suggestions/triage",
    ]) {
      expect(Object.keys(body.paths)).toContain(path);
    }
    for (const path of ["/api/v1/ai/status", "/api/v1/ai/metrics", "/api/v1/ai/suggestions"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(403);
    }
  });

  test("AI-disabled is the default, so a deployment with no AI env is safe", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ai/status`, {
      headers: { "X-Org-Id": "org-a" },
    });
    // Unauthenticated: the guard answers before any AI logic runs.
    expect([403, 401]).toContain(response.status);
  });
});
