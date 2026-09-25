import { Controller, Get } from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { Redis } from "ioredis";
import { logEvent } from "./logger";

export interface DependencyCheck {
  status: "ok" | "unreachable";
  latencyMs?: number;
  detail?: string;
}

export interface Readiness {
  status: "ok" | "degraded";
  checks: {
    database: DependencyCheck;
    queue: DependencyCheck;
    storage: DependencyCheck;
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

async function checkPostgres(): Promise<DependencyCheck> {
  const startedAt = Date.now();
  const url = process.env.DATABASE_URL ?? "";
  const match = /postgresql:\/\/[^:]+:[^@]+@([^:]+):(\d+)\/.+/.exec(url);
  if (!match?.[1] || !match[2]) {
    return { status: "unreachable", detail: "DATABASE_URL not configured" };
  }
  const host = match[1];
  const port = Number(match[2]);
  try {
    await withTimeout(
      import("node:net").then(
        ({ connect }) =>
          new Promise<void>((resolve, reject) => {
            const socket = connect({ host, port }, () => {
              socket.end();
              resolve();
            });
            socket.on("error", reject);
          }),
      ),
      2000,
      "postgres probe",
    );
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: "unreachable",
      detail: error instanceof Error ? error.message : "unknown",
    };
  }
}

async function checkRedis(): Promise<DependencyCheck> {
  const startedAt = Date.now();
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on("error", () => undefined);
  try {
    await withTimeout(redis.ping(), 2000, "redis ping");
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: "unreachable",
      detail: error instanceof Error ? error.message : "unknown",
    };
  } finally {
    redis.disconnect();
  }
}

async function checkStorage(): Promise<DependencyCheck> {
  const startedAt = Date.now();
  const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`${endpoint}/minio/health/live`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        return { status: "unreachable", detail: `HTTP ${response.status}` };
      }
      return { status: "ok", latencyMs: Date.now() - startedAt };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return {
      status: "unreachable",
      detail: error instanceof Error ? error.message : "unknown",
    };
  }
}

@ApiTags("health")
@Controller()
export class HealthController {
  @Get("health")
  @ApiResponse({ status: 200, description: "Liveness probe." })
  health() {
    return { status: "ok", service: "api" };
  }

  @Get("ready")
  @ApiResponse({
    status: 200,
    description: "Readiness with dependency checks.",
  })
  async ready(): Promise<Readiness> {
    const [database, queue, storage] = await Promise.all([
      checkPostgres(),
      checkRedis(),
      checkStorage(),
    ]);
    const status =
      database.status === "ok" && queue.status === "ok" && storage.status === "ok"
        ? "ok"
        : "degraded";
    if (status === "degraded") {
      logEvent("warn", {
        event: "health.ready.degraded",
        checks: { database, queue, storage },
      });
    }
    return { status, checks: { database, queue, storage } };
  }

  @Get("api/v1/health")
  @ApiResponse({
    status: 200,
    description: "Versioned liveness probe for the web SPA.",
  })
  apiHealth() {
    return this.health();
  }
}
