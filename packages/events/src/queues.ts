export const EVENTS_VERSION = "0.1.0";

/**
 * Central registry of BullMQ queue names (WS-12 queue monitoring).
 * Producers/workers register here so the monitoring endpoint and the
 * worker share one source of truth — never hard-code queue names twice.
 */
const knownQueues = new Set<string>([
  "email",
  "pdf",
  "notifications",
  "reminders",
  "imports",
  "charges",
]);

export function registerQueue(name: string): void {
  knownQueues.add(name);
}

export function listQueues(): string[] {
  return [...knownQueues].sort();
}
