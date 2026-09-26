export type ConflictStrategy = "server-wins";

export interface QueuedMutation {
  id: string;
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  attempts: number;
  maxAttempts: number;
  strategy: ConflictStrategy;
  createdAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface FlushResult {
  sent: string[];
  conflicted: string[];
  pending: string[];
}

const STORAGE_KEY = "admin-alquiler.offline-queue.v1";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export class OfflineQueue {
  private items: QueuedMutation[] = [];

  constructor(private readonly storage: StorageLike) {
    this.load();
  }

  private load(): void {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as QueuedMutation[];
        if (Array.isArray(parsed)) {
          this.items = parsed;
        }
      }
    } catch {
      this.items = [];
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {
      // Storage full or unavailable: keep the in-memory queue.
    }
  }

  get size(): number {
    return this.items.length;
  }

  enqueue(input: {
    url: string;
    method?: string;
    body?: string | null;
    headers?: Record<string, string>;
    maxAttempts?: number;
  }): QueuedMutation {
    const item: QueuedMutation = {
      id: randomId(),
      url: input.url,
      method: input.method ?? "POST",
      body: input.body ?? null,
      headers: input.headers ?? {},
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 5,
      strategy: "server-wins",
      createdAt: Date.now(),
    };
    this.items.push(item);
    this.persist();
    return item;
  }

  pending(): QueuedMutation[] {
    return [...this.items];
  }

  async flush(): Promise<FlushResult> {
    const sent: string[] = [];
    const conflicted: string[] = [];
    const remaining: QueuedMutation[] = [];
    for (const item of this.items) {
      if (item.attempts >= item.maxAttempts) {
        conflicted.push(item.id);
        continue;
      }
      let response: Response;
      try {
        response = await fetch(item.url, {
          method: item.method,
          headers: { "Content-Type": "application/json", ...item.headers },
          body: item.body,
        });
      } catch {
        item.attempts += 1;
        if (item.attempts >= item.maxAttempts) {
          conflicted.push(item.id);
        } else {
          remaining.push(item);
        }
        continue;
      }
      if (response.status === 409) {
        conflicted.push(item.id);
        continue;
      }
      if (!response.ok) {
        item.attempts += 1;
        if (item.attempts >= item.maxAttempts) {
          conflicted.push(item.id);
        } else {
          remaining.push(item);
        }
        continue;
      }
      sent.push(item.id);
    }
    this.items = remaining;
    this.persist();
    return { sent, conflicted, pending: remaining.map((item) => item.id) };
  }

  drop(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    if (this.items.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  clear(): void {
    this.items = [];
    this.persist();
  }
}
