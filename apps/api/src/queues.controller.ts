import { listQueues } from "@admin-alquiler/events";
import { Controller, Get } from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

export interface QueueHealth {
  name: string;
  status: "ok" | "unreachable";
  waiting?: number;
  active?: number;
  delayed?: number;
  failed?: number;
  deadLetter?: number;
  detail?: string;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/**
 * WS-12 queue monitoring: depth, failures and dead-letter visibility per
 * registered queue. Unreachable Redis degrades per-queue, never 500s the
 * endpoint (monitoring must work during incidents).
 */
@ApiTags("queues")
@Controller("api/v1")
export class QueuesController {
  @Get("queues")
  @ApiResponse({
    status: 200,
    description: "Depth, failures and dead-letter visibility per queue.",
  })
  async queues(): Promise<{ queues: QueueHealth[] }> {
    const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      connectTimeout: 1500,
    });
    redis.on("error", () => undefined);
    try {
      const result = await Promise.all(
        listQueues().map(async (name): Promise<QueueHealth> => {
          const queue = new Queue(name, { connection: redis });
          try {
            const [waiting, active, delayed, failed] = await withTimeout(
              Promise.all([
                queue.getWaitingCount(),
                queue.getActiveCount(),
                queue.getDelayedCount(),
                queue.getFailedCount(),
              ]),
              2500,
              `queue probe ${name}`,
            );
            // BullMQ has no separate DLQ; failed jobs past attempts are the
            // dead-letter signal — surfaced explicitly for operators.
            return {
              name,
              status: "ok",
              waiting,
              active,
              delayed,
              failed,
              deadLetter: failed,
            };
          } catch (error) {
            return {
              name,
              status: "unreachable",
              detail: error instanceof Error ? error.message : "unknown",
            };
          } finally {
            await queue.close().catch(() => undefined);
          }
        }),
      );
      return { queues: result };
    } finally {
      redis.disconnect();
    }
  }
}
