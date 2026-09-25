import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { logEvent } from "./logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id";

declare module "express" {
  interface Request {
    requestId?: string;
  }
}

/**
 * WS-12: generate/propagate `X-Request-Id` and emit a structured
 * request-completed log (timestamp, severity, service, request ID, event,
 * duration, error code; no sensitive payloads).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER.toLowerCase()]);
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    const startedAt = Date.now();
    res.on("finish", () => {
      logEvent(res.statusCode >= 500 ? "error" : "info", {
        requestId,
        event: "http.request.completed",
        durationMs: Date.now() - startedAt,
        code: res.statusCode >= 400 ? `HTTP_${res.statusCode}` : undefined,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
      });
    });
    next();
  }
}
