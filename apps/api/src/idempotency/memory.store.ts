import type { IdempotencyRecord, IdempotencyStore } from "./store";

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(key) ?? null;
  }

  async set(key: string, record: IdempotencyRecord, _ttlSeconds?: number): Promise<void> {
    this.records.set(key, record);
  }
}
