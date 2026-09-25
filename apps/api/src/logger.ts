import pino from "pino";

export type LogSeverity = "debug" | "info" | "warn" | "error";

export interface LogFields {
  requestId?: string;
  orgId?: string;
  actorId?: string;
  event: string;
  durationMs?: number;
  code?: string | undefined;
  [key: string]: unknown;
}

/**
 * Structured JSON logger (WS-12). Pino already emits
 * timestamp/level/service; `logEvent` enforces the required shape and
 * redacts secrets by construction (never pass tokens/passwords as fields).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "api" },
  redact: {
    paths: [
      "password",
      "token",
      "*.password",
      "*.token",
      "authorization",
      "cookie",
      "DATABASE_URL",
      "JWT_SECRET",
      "MINIO_ROOT_PASSWORD",
      "POSTGRES_PASSWORD",
    ],
    censor: "[redacted]",
  },
});

export function logEvent(severity: LogSeverity, fields: LogFields): void {
  logger[severity]({ ...fields, severity });
}
