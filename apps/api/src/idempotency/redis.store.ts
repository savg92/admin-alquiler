import { Redis } from "ioredis";
import { IDEMPOTENCY_TTL_SECONDS, type IdempotencyRecord, type IdempotencyStore } from "./store";

export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis =
      redis ??
      new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
    this.redis.on("error", () => undefined);
  }

  async get(key: string): Promise<IdempotencyRecord | null> {
    const raw = await this.redis.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as IdempotencyRecord;
  }

  async set(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(record), "EX", ttlSeconds);
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }

  disconnect(): void {
    this.redis.disconnect();
  }
}

export { IDEMPOTENCY_TTL_SECONDS };
