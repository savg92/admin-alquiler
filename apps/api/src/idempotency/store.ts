import { createHash } from "node:crypto";

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export interface IdempotencyRecord {
  payloadHash: string;
  status: number;
  body: unknown;
  createdAt: string;
}

export type IdempotencyLookup = "miss" | "replay" | "conflict";

export function hashPayload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload ?? {}))
    .digest("hex");
}

export function storageKey(orgId: string, userId: string, key: string): string {
  return `idempotency:${orgId}:${userId}:${key}`;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void>;
}

export function compareRecord(
  record: IdempotencyRecord | null,
  payloadHash: string,
  now: number = Date.now(),
): IdempotencyLookup {
  if (!record) {
    return "miss";
  }
  if (Date.parse(record.createdAt) + IDEMPOTENCY_TTL_SECONDS * 1000 <= now) {
    return "miss";
  }
  return record.payloadHash === payloadHash ? "replay" : "conflict";
}
