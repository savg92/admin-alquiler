import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { logEvent } from "../logger";
import { MemoryIdempotencyStore } from "./memory.store";
import { RedisIdempotencyStore } from "./redis.store";
import {
  compareRecord,
  hashPayload,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_TTL_SECONDS,
  storageKey,
} from "./store";

interface ScopedRequest extends Request {
  requestId?: string;
  user?: { id?: string };
}

function scopeOf(req: ScopedRequest): { orgId: string; userId: string } {
  const headerOrg = req.headers["x-org-id"];
  const orgId =
    typeof headerOrg === "string" && headerOrg.trim().length > 0 ? headerOrg.trim() : "none";
  const userId = req.user?.id ?? "anonymous";
  return { orgId, userId };
}

/**
 * `Idempotency-Key` convention (SRS §8): POST-only, 24h window, keys scoped
 * per organization + user. Same key + same payload replays the original
 * result; same key + different payload is a 409.
 */
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly memory = new MemoryIdempotencyStore();
  private redis: RedisIdempotencyStore | null = null;
  private redisChecked = false;

  private async store(): Promise<MemoryIdempotencyStore | RedisIdempotencyStore> {
    if (!this.redisChecked) {
      this.redisChecked = true;
      const candidate = new RedisIdempotencyStore();
      try {
        await candidate.ping();
        this.redis = candidate;
      } catch {
        candidate.disconnect();
        logEvent("warn", { event: "idempotency.redis_unavailable" });
      }
    }
    return this.redis ?? this.memory;
  }

  async use(req: ScopedRequest, res: Response, next: NextFunction): Promise<void> {
    if (req.method !== "POST") {
      next();
      return;
    }
    const header = req.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
    if (typeof header !== "string" || header.trim().length === 0) {
      next();
      return;
    }
    const { orgId, userId } = scopeOf(req);
    const key = storageKey(orgId, userId, header.trim());
    const payloadHash = hashPayload(req.body);
    let store: MemoryIdempotencyStore | RedisIdempotencyStore;
    try {
      store = await this.store();
    } catch {
      logEvent("warn", {
        event: "idempotency.store_unavailable",
        requestId: req.requestId,
      });
      next();
      return;
    }
    const lookup = compareRecord(await store.get(key), payloadHash);

    if (lookup === "replay") {
      const record = await store.get(key);
      res.status(record?.status ?? 200).json(record?.body);
      return;
    }
    if (lookup === "conflict") {
      res.status(409).json({
        error: {
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Idempotency-Key was already used with a different payload.",
        },
        requestId: req.requestId,
      });
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      void store
        .set(
          key,
          {
            payloadHash,
            status: res.statusCode,
            body,
            createdAt: new Date().toISOString(),
          },
          IDEMPOTENCY_TTL_SECONDS,
        )
        .catch(() => undefined);
      return originalJson(body);
    }) as typeof res.json;
    next();
  }
}
