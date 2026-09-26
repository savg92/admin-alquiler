export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DownloadState = "absent" | "downloading" | "complete" | "failed";

export interface ModelCacheEntry {
  modelId: string;
  state: DownloadState;
  /** Bytes already written, so an interrupted download can resume from here. */
  receivedBytes: number;
  totalBytes: number | null;
  updatedAt: number;
}

const STORAGE_KEY = "admin-alquiler.model-cache.v1";

export function canResume(entry: ModelCacheEntry | null): boolean {
  if (entry === null) {
    return false;
  }
  if (entry.state !== "downloading") {
    return false;
  }
  return entry.totalBytes === null || entry.receivedBytes < entry.totalBytes;
}

export class ModelCache {
  private entries = new Map<string, ModelCacheEntry>();

  constructor(private readonly storage: StorageLike) {
    this.load();
  }

  private load(): void {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw === null) {
        return;
      }
      const parsed = JSON.parse(raw) as { entries?: ModelCacheEntry[] };
      for (const entry of parsed.entries ?? []) {
        this.entries.set(entry.modelId, entry);
      }
    } catch {
      this.entries.clear();
    }
  }

  private persist(): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ entries: [...this.entries.values()] }));
  }

  get(modelId: string): ModelCacheEntry | null {
    return this.entries.get(modelId) ?? null;
  }

  list(): ModelCacheEntry[] {
    return [...this.entries.values()];
  }

  isComplete(modelId: string): boolean {
    return this.entries.get(modelId)?.state === "complete";
  }

  startDownload(
    modelId: string,
    totalBytes: number | null,
    now: number = Date.now(),
  ): ModelCacheEntry {
    const existing = this.entries.get(modelId);
    const entry: ModelCacheEntry = {
      modelId,
      state: "downloading",
      receivedBytes: existing?.state === "downloading" ? existing.receivedBytes : 0,
      totalBytes,
      updatedAt: now,
    };
    this.entries.set(modelId, entry);
    this.persist();
    return entry;
  }

  resumeOffset(modelId: string): number {
    const entry = this.entries.get(modelId);
    return entry !== undefined && canResume(entry) ? entry.receivedBytes : 0;
  }

  recordProgress(
    modelId: string,
    receivedBytes: number,
    now: number = Date.now(),
  ): ModelCacheEntry {
    const existing = this.entries.get(modelId);
    if (existing === undefined) {
      throw new Error("Download was not started.");
    }
    if (existing.state === "complete") {
      return existing;
    }
    const totalBytes = existing.totalBytes;
    const reachedEnd = totalBytes !== null && receivedBytes >= totalBytes;
    const entry: ModelCacheEntry = {
      ...existing,
      state: reachedEnd ? "complete" : "downloading",
      receivedBytes: reachedEnd && totalBytes !== null ? totalBytes : receivedBytes,
      updatedAt: now,
    };
    this.entries.set(modelId, entry);
    this.persist();
    return entry;
  }

  complete(modelId: string, totalBytes: number | null, now: number = Date.now()): ModelCacheEntry {
    const existing = this.entries.get(modelId);
    const entry: ModelCacheEntry = {
      modelId,
      state: "complete",
      receivedBytes: totalBytes ?? existing?.receivedBytes ?? 0,
      totalBytes,
      updatedAt: now,
    };
    this.entries.set(modelId, entry);
    this.persist();
    return entry;
  }

  fail(modelId: string, now: number = Date.now()): ModelCacheEntry {
    const existing = this.entries.get(modelId);
    if (existing === undefined) {
      throw new Error("Download was not started.");
    }
    const entry: ModelCacheEntry = { ...existing, state: "failed", updatedAt: now };
    this.entries.set(modelId, entry);
    this.persist();
    return entry;
  }

  evict(modelId: string): void {
    this.entries.delete(modelId);
    this.persist();
  }

  /** A download that never completed stays resumable; a failed one is restarted from zero. */
  interrupted(): ModelCacheEntry[] {
    return this.list().filter((entry) => entry.state === "downloading");
  }
}
