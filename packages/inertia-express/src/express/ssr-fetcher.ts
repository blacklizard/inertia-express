import type { SsrRenderer, SsrResult } from './types.js';
import type { InertiaPage } from '../core/index.js';

/**
 * Inputs to {@link createInertiaSsrFetcher}.
 */
export interface InertiaSsrFetcherOptions {
  /** SSR endpoint URL — typically your internal LB DNS, e.g. `http://ssr.internal/render`. */
  url: string;
  /** Per-attempt timeout in milliseconds. Default 5000. */
  timeoutMs?: number;
  /** Number of retry attempts after the first failure. Default 2 (so up to 3 total tries). */
  retries?: number;
  /** Initial backoff in ms; doubles per retry. Default 100. */
  retryBaseMs?: number;
  /**
   * Circuit breaker: open after this many consecutive failures.
   * Set to `0` (or `Infinity`) to disable. Default 5.
   */
  breakerThreshold?: number;
  /** How long the breaker stays open before allowing one probe. Default 30000. */
  breakerCooldownMs?: number;
  /** Failure mode. Default `"client"`. */
  fallback?: 'client' | 'throw';
  /** Override fetch implementation (testing). */
  fetch?: typeof fetch;
  /** Extra headers sent with each render request. */
  headers?: Record<string, string>;
}

const EMPTY_RESULT: SsrResult = { body: '', head: '' };

interface BreakerState {
  failures: number;
  openedAt: number | null;
}

/**
 * Resolve after the given number of milliseconds.
 *
 * @param ms Delay in milliseconds.
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Build an {@link SsrRenderer} that POSTs the page object to a separate Node
 * SSR process (or load-balanced pool) and returns the rendered
 * `{ head, body }`.
 *
 * Matches the wire protocol used by `@inertiajs/{vue3,react,svelte}/server`
 * `createServer()`: `POST <url>` with `application/json` body containing the
 * page object, response is `{ head: string[], body: string }`.
 *
 * Adds production hardening on top of the bare protocol:
 *   - Per-attempt timeout (default 5000ms) via `AbortController`.
 *   - Recursive retry with exponential backoff (`retryBaseMs * 2^attempt`).
 *   - Circuit breaker — opens after `breakerThreshold` consecutive failed
 *     *requests* (not attempts); half-opens after `breakerCooldownMs` so a
 *     probe request can re-close it on success.
 *   - `fallback`: `"client"` returns an empty SSR result so the client
 *     renders alone; `"throw"` rethrows so Express's error handler can react.
 *
 * @param options Fetcher configuration — see {@link InertiaSsrFetcherOptions}.
 */
export function createInertiaSsrFetcher(options: InertiaSsrFetcherOptions): SsrRenderer {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const retries = options.retries ?? 2;
  const retryBaseMs = options.retryBaseMs ?? 100;
  const breakerThreshold = options.breakerThreshold ?? 5;
  const breakerCooldownMs = options.breakerCooldownMs ?? 30000;
  const fallback = options.fallback ?? 'client';
  const breakerEnabled = breakerThreshold > 0 && Number.isFinite(breakerThreshold);

  const state: BreakerState = { failures: 0, openedAt: null };

  /**
   * Returns `true` while the breaker is open and within its cooldown window;
   * a return of `false` after a previous failure means we are half-open and
   * the caller may attempt a probe request.
   */
  function breakerOpen(): boolean {
    if (!breakerEnabled || state.openedAt === null) {
      return false;
    }

    if (Date.now() - state.openedAt >= breakerCooldownMs) {
      // Half-open: let the next request probe.
      return false;
    }

    return true;
  }

  /**
   * Reset the breaker after a successful render.
   */
  function recordSuccess(): void {
    state.failures = 0;
    state.openedAt = null;
  }

  /**
   * Increment the failure counter; open the breaker when the threshold is hit.
   */
  function recordFailure(): void {
    state.failures += 1;

    if (breakerEnabled && state.failures >= breakerThreshold) {
      state.openedAt = Date.now();
    }
  }

  /**
   * Fire one SSR request — the unit the retry loop wraps. Throws on
   * timeout, network error, or non-2xx response.
   *
   * @param page Page object to send to the SSR server.
   */
  async function attempt(page: InertiaPage): Promise<SsrResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl(options.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: JSON.stringify(page),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Inertia SSR request failed: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as Partial<SsrResult>;

      return {
        body: json.body ?? '',
        head: json.head,
        bodyIsFullRoot: json.bodyIsFullRoot,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return async ({ page }: { page: InertiaPage }): Promise<SsrResult> => {
    if (breakerOpen()) {
      if (fallback === 'throw') {
        throw new Error('Inertia SSR circuit breaker is open');
      }

      return EMPTY_RESULT;
    }

    /**
     * Run one render attempt, recursing with exponential backoff until the
     * retry budget is spent. Records breaker success on the first win.
     *
     * @param remaining Retry attempts left before the error propagates.
     */
    const attemptWithRetry = async (remaining: number): Promise<SsrResult> => {
      try {
        const result = await attempt(page);
        recordSuccess();

        return result;
      } catch (err) {
        if (remaining <= 0) {
          throw err;
        }

        await sleep(retryBaseMs * 2 ** (retries - remaining));

        return attemptWithRetry(remaining - 1);
      }
    };

    try {
      return await attemptWithRetry(retries);
    } catch (lastError) {
      recordFailure();

      if (fallback === 'throw') {
        throw lastError;
      }

      return EMPTY_RESULT;
    }
  };
}
