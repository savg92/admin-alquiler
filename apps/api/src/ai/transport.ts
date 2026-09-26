export type UpstreamFailure = "timeout" | "rate-limited" | "unavailable" | "rejected" | "malformed";

export class UpstreamError extends Error {
  readonly failure: UpstreamFailure;
  readonly status: number | null;

  constructor(failure: UpstreamFailure, message: string, status: number | null = null) {
    super(message);
    this.name = "UpstreamError";
    this.failure = failure;
    this.status = status;
  }
}

export interface TransportPolicy {
  timeoutMs: number;
  maxRetries: number;
}

const BASE_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 4000;

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(MAX_BACKOFF_MS, seconds * 1000);
    }
  }
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * POSTs JSON to an OpenAI-compatible upstream and returns the parsed body.
 * Retries timeouts, rate limits and 5xx; never retries a 4xx rejection, so a
 * malformed request fails fast instead of burning the retry budget.
 */
export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  policy: TransportPolicy,
): Promise<unknown> {
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const payload = (await response.json().catch(() => null)) as unknown;
      if (response.ok) {
        return payload;
      }
      if (isRetryableStatus(response.status) && attempt < policy.maxRetries) {
        await sleep(retryDelayMs(attempt, response.headers.get("Retry-After")));
        attempt += 1;
        continue;
      }
      throw new UpstreamError(
        response.status === 429
          ? "rate-limited"
          : response.status >= 500
            ? "unavailable"
            : "rejected",
        `Upstream answered ${response.status}.`,
        response.status,
      );
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof UpstreamError) {
        throw error;
      }
      const aborted = error instanceof Error && error.name === "AbortError";
      if (attempt >= policy.maxRetries) {
        throw new UpstreamError(
          aborted ? "timeout" : "unavailable",
          aborted ? "Upstream timed out." : "Upstream is unreachable.",
        );
      }
      await sleep(retryDelayMs(attempt, null));
      attempt += 1;
    }
  }
}
