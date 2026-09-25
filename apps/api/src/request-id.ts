import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Resolve the request ID: reuse the inbound `X-Request-Id` when present,
 * otherwise generate one. Pure function so it is unit-testable (WS-12).
 */
export function resolveRequestId(
  inbound: string | string[] | undefined,
): string {
  if (typeof inbound === "string" && inbound.trim().length > 0) {
    return inbound.trim();
  }
  return randomUUID();
}
