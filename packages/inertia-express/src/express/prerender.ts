import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Inputs to {@link prerender}.
 */
export interface PrerenderOptions {
  /** Origin to fetch from, e.g. `http://127.0.0.1:3000`. */
  baseUrl: string;
  /** List of paths to render. Each must start with `/`. */
  routes: string[];
  /** Output mode. Default `"warmup"`. */
  mode?: 'static' | 'warmup' | 'both';
  /** Output directory for static HTML. Required when mode includes `"static"`. */
  outDir?: string;
  /** Concurrency limit. Default 4. */
  concurrency?: number;
  /** Per-request timeout, ms. Default 30000. */
  timeoutMs?: number;
  /** Extra request headers (auth, host override, A/B bucket pinning, etc.). */
  headers?: Record<string, string>;
  /** Optional fetch override (for testing). */
  fetch?: typeof fetch;
}

/**
 * Per-route outcome from a prerender run. `status` is `null` and `error` is
 * populated when the request failed before producing a response.
 */
export interface PrerenderRouteResult {
  route: string;
  status: number | null;
  bytes: number;
  outputPath?: string;
  error?: string;
  durationMs: number;
}

/**
 * Aggregate result returned by {@link prerender}. `ok + failed === total`;
 * a route counts as `ok` when it returned a 2xx/3xx status and no error.
 */
export interface PrerenderSummary {
  total: number;
  ok: number;
  failed: number;
  results: PrerenderRouteResult[];
}

/**
 * Map an HTTP route to an on-disk static-output path. `/` maps to
 * `<outDir>/index.html`; `/foo/bar` to `<outDir>/foo/bar/index.html`.
 * Query strings are stripped before computing the path — reverse proxies
 * (nginx, Caddy, CloudFront) split the URL at `?` when looking up static
 * files, so embedding the query string in a directory name produces a path
 * that can never be served.
 *
 * @param outDir Static-output root.
 * @param route HTTP path (with optional query string) being prerendered.
 */
function routeToFile(outDir: string, route: string): string {
  // Extract path-only; discard query string and fragment.
  const { pathname } = new URL(route, 'http://x');
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');

  if (!trimmed) {
    return join(outDir, 'index.html');
  }

  return join(outDir, trimmed, 'index.html');
}

/**
 * Write the rendered HTML to disk when the mode includes static output.
 * Returns the file path written, or `undefined` for warmup-only modes.
 * Throws when static output is requested without an `outDir`.
 *
 * @param options Shared prerender options — `outDir` lives here.
 * @param route HTTP path being rendered; mapped to the on-disk path.
 * @param html Rendered response body to write.
 * @param mode Resolved output mode for this run.
 */
async function maybeWriteStatic(
  options: PrerenderOptions,
  route: string,
  html: string,
  mode: 'static' | 'warmup' | 'both',
): Promise<string | undefined> {
  if (mode !== 'static' && mode !== 'both') {
    return undefined;
  }

  if (!options.outDir) {
    throw new Error(`outDir is required when mode is "${mode}"`);
  }

  const outputPath = routeToFile(options.outDir, route);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');

  return outputPath;
}

/**
 * Fetch a single route, optionally write its body to disk, and return a
 * {@link PrerenderRouteResult}. Never throws — failures are returned with
 * `status: null` and an `error` message so the calling loop keeps going.
 *
 * @param options Shared prerender options (baseUrl, mode, outDir, etc.).
 * @param route HTTP path to render.
 */
async function runOne(options: PrerenderOptions, route: string): Promise<PrerenderRouteResult> {
  const fetchImpl = options.fetch ?? fetch;
  const mode = options.mode ?? 'warmup';
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 30000);

  try {
    const url = new URL(route, options.baseUrl).toString();
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'text/html', ...options.headers },
      signal: ctrl.signal,
    });
    const html = await res.text();
    const outputPath = await maybeWriteStatic(options, route, html, mode);

    return {
      route,
      status: res.status,
      bytes: Buffer.byteLength(html),
      outputPath,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      route,
      status: null,
      bytes: 0,
      error: (err as Error).message,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run the prerender pipeline. Programmatic entry-point for the
 * `bin/inertia-prerender` CLI.
 *
 * Two output modes (which can be combined via `"both"`):
 *
 * - **`warmup`** (default) — fetches each route, discards the body. Use to
 *   populate the SSR view cache after a deploy so the first real visitor
 *   doesn't pay the SSR latency cost.
 * - **`static`** — fetches each route and writes the response body to
 *   `<outDir>/<route>/index.html`. Serve those files directly via
 *   nginx/CDN, bypassing Express entirely.
 *
 * Bounded-concurrency: `concurrency` workers consume routes from a shared
 * counter; the returned `results` preserve input order. Failures on
 * individual routes never halt the run — the per-route summary lets a CI
 * step choose to fail-loud.
 *
 * @param options Pipeline configuration — see {@link PrerenderOptions}.
 */
export async function prerender(options: PrerenderOptions): Promise<PrerenderSummary> {
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const results: PrerenderRouteResult[] = new Array(options.routes.length);
  let next = 0;

  /**
   * Claim the next route index and process it, then recurse. Recursion
   * (instead of a loop) avoids both `while`-spin and `no-await-in-loop`.
   */
  async function worker(): Promise<void> {
    const i = next;
    next += 1;

    if (i >= options.routes.length) {
      return;
    }

    const route = options.routes[i] ?? '';
    results[i] = await runOne(options, route);
    await worker();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, options.routes.length) }, async () => worker()));

  const ok = results.filter((r) => r && r.status !== null && r.status < 400 && !r.error).length;
  const failed = results.length - ok;

  return {
    total: results.length, ok, failed, results,
  };
}
