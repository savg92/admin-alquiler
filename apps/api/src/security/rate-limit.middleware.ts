import { Injectable, type NestMiddleware, type Type } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  skip?: (req: Request) => boolean;
  now?: () => number;
}

export function requestPath(req: Request): string {
  const raw = req.originalUrl ?? req.url ?? req.path ?? "/";
  const query = raw.indexOf("?");
  return query === -1 ? raw : raw.slice(0, query);
}

export function rateLimitMiddleware(options: RateLimitOptions): Type<NestMiddleware> {
  const hits = new Map<string, number[]>();
  const now = options.now ?? Date.now;

  @Injectable()
  class RateLimitHandler implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void {
      if (options.skip?.(req) === true) {
        next();
        return;
      }
      const key = `${req.ip ?? "unknown"} ${req.method} ${requestPath(req)}`;
      const at = now();
      const windowStart = at - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > windowStart);
      if (recent.length >= options.max) {
        const retryAfter = Math.max(
          1,
          Math.ceil((recent[0] as number) + options.windowMs - at) / 1000,
        );
        res.status(429).set("Retry-After", String(retryAfter)).json({
          statusCode: 429,
          message: "Too many requests.",
        });
        return;
      }
      recent.push(at);
      hits.set(key, recent);
      next();
    }
  }

  return RateLimitHandler;
}

export function isHealthProbe(req: Request): boolean {
  const path = requestPath(req);
  return path === "/health" || path === "/ready";
}

export const RateLimitMiddleware = rateLimitMiddleware({
  windowMs: 60_000,
  max: 300,
  skip: isHealthProbe,
});
