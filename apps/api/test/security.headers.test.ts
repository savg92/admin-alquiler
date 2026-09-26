import "reflect-metadata";
import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SecurityHeadersMiddleware } from "../src/security/headers.middleware";
import { rateLimitMiddleware, requestPath } from "../src/security/rate-limit.middleware";

@Controller()
class ProbeController {
  @Get("health")
  health() {
    return { status: "ok" };
  }

  @Get("api/v1/ping")
  ping() {
    return { pong: true };
  }
}

@Module({ controllers: [ProbeController] })
class SecurityProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        SecurityHeadersMiddleware,
        rateLimitMiddleware({
          windowMs: 60_000,
          max: 4,
          skip: (req) => requestPath(req) === "/health",
        }),
      )
      .forRoutes("*");
  }
}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(SecurityProbeModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe("secure headers and rate limiting", () => {
  test("every response carries hardening headers and no powered-by", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ping`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(response.headers.get("x-powered-by")).toBeNull();
  });

  test("exceeding the window returns 429 with Retry-After", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ok = await fetch(`${baseUrl}/api/v1/ping`);
      expect(ok.status).toBe(200);
    }
    const limited = await fetch(`${baseUrl}/api/v1/ping`);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
  test("health probes are exempt from rate limiting", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
    }
  });
});
