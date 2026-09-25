import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { setupOpenApi } from "../src/openapi";

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  setupOpenApi(app);
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe("WS-12 reliability endpoints", () => {
  test("GET /health returns ok with a propagated request ID", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(typeof response.headers.get("X-Request-Id")).toBe("string");
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("GET /health echoes an inbound request ID", async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { "X-Request-Id": "test-req-1" },
    });
    expect(response.headers.get("X-Request-Id")).toBe("test-req-1");
  });

  test("GET /openapi.json serves the code-first contract", async () => {
    const response = await fetch(`${baseUrl}/openapi.json`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(typeof body.openapi).toBe("string");
    expect("/health" in body.paths).toBe(true);
    expect("/ready" in body.paths).toBe(true);
    expect("/api/v1/queues" in body.paths).toBe(true);
  });
  test("GET /ready reports per-dependency status without 500ing", async () => {
    const response = await fetch(`${baseUrl}/ready`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      checks: Record<string, { status: string } | undefined>;
    };
    expect(["ok", "degraded"]).toContain(body.status);
    for (const name of ["database", "queue", "storage"]) {
      const status = body.checks[name]?.status ?? "missing";
      expect(["ok", "unreachable"]).toContain(status);
    }
  });

  test("GET /api/v1/queues lists registered queues without 500ing", async () => {
    const response = await fetch(`${baseUrl}/api/v1/queues`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      queues: { name: string; status: string }[];
    };
    expect(Array.isArray(body.queues)).toBe(true);
    expect(body.queues.length).toBeGreaterThan(0);
    for (const queue of body.queues) {
      expect(typeof queue.name).toBe("string");
      expect(["ok", "unreachable"]).toContain(queue.status);
    }
  });
});
