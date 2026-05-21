import { createServer } from 'node:http';

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The page object as posted by the Inertia adapter (`@blacklizard/inertia-express`)
 * to the SSR worker. Structurally typed to avoid a runtime/type dependency
 * on the adapter package.
 */
export interface InertiaSsrPage {
  component: string;
  props: Record<string, unknown>;
  url: string;
  version: string | null;
  clearHistory: boolean;
  encryptHistory: boolean;
  [key: string]: unknown;
}

/**
 * What the user-supplied render function returns. Must match the Inertia v3
 * SSR contract used by `@inertiajs/{vue3,react,svelte}/server`.
 */
export interface SsrRenderOutput {
  body: string;
  head?: string | string[];
  bodyIsFullRoot?: boolean;
}

/**
 * User-supplied render function. May be sync or async — both are awaited.
 */
export type SsrRender = (page: InertiaSsrPage) => Promise<SsrRenderOutput> | SsrRenderOutput;

/**
 * Configuration for {@link createInertiaSsrWorker}. Only `render` is
 * required; every other field has a production-sensible default.
 */
export interface InertiaSsrWorkerOptions {
  /** User render function — typically wraps `createInertiaApp` in SSR mode. */
  render: SsrRender;

  /** Listen port. Default 13714 (Inertia convention). */
  port?: number;
  /** Listen host. Default `0.0.0.0`. */
  host?: string;

  /** Recycle the process after this many `/render` requests. Default 1000. Set 0 to disable. */
  maxRequests?: number;
  /** Recycle the process after this many seconds of uptime. Default 3600. Set 0 to disable. */
  maxLifetimeSec?: number;
  /** Recycle the process when RSS exceeds this many MB. Default 512. Set 0 to disable. */
  maxRssMb?: number;
  /** Polling interval for RSS check, in ms. Default 10000. */
  rssCheckIntervalMs?: number;

  /**
   * Maximum time to wait for in-flight `/render` calls to drain before
   * exiting. Default 10000.
   */
  drainTimeoutMs?: number;

  /** Optional logger. Defaults to `console`. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;

  /**
   * Called when the worker decides to recycle. Receives the trigger so
   * orchestrators can record metrics. Default no-op.
   */
  onRecycle?: (reason: RecycleReason) => void;

  /**
   * If true (default), the worker calls `process.exit(0)` after draining
   * on recycle / SIGTERM / SIGINT. Set `false` for tests or when you want
   * to control shutdown yourself.
   */
  autoExit?: boolean;
}

/**
 * Why the worker triggered a recycle, passed to `onRecycle` and logged.
 */
export type RecycleReason = 'max-requests' | 'max-lifetime' | 'max-rss';

/**
 * Returned by {@link createInertiaSsrWorker}. Lets the caller observe state,
 * drain gracefully, or close the HTTP server.
 */
export interface InertiaSsrWorkerHandle {
  /** Currently bound port. */
  port: number;
  /** Resolves when the HTTP server is actively listening. */
  ready: Promise<void>;
  /** True once the worker has begun graceful shutdown. */
  isDraining: () => boolean;
  /**
   * Begin graceful shutdown. Returns when in-flight requests have completed
   * or `drainTimeoutMs` has elapsed. Does not call `process.exit` — the
   * caller decides whether to exit.
   */
  drain: () => Promise<void>;
  /**
   * Stop accepting new connections and resolve once the underlying HTTP
   * server is closed. Unlike `drain`, this does not flip `isDraining()` to
   * `true` and has no timeout — it relies entirely on `server.close()`.
   */
  close: () => Promise<void>;
}

interface InternalState {
  draining: boolean;
  inFlight: number;
  requestCount: number;
  startedAt: number;
  recycled: boolean;
}

/**
 * Boot a production SSR worker.
 *
 * HTTP surface:
 *   - `POST /render`   — body: page JSON. Response: `{ head, body, bodyIsFullRoot? }`.
 *                        Returns 503 when draining.
 *   - `GET /health`    — 200 healthy, 503 draining.
 *   - `GET /ready`     — 200 (we're ready as soon as the server is listening).
 *   - Anything else    — 404.
 *
 * Self-healing:
 *   - After `maxRequests` served, after `maxLifetimeSec` of uptime, or when
 *     `process.memoryUsage().rss` exceeds `maxRssMb`, the worker flips
 *     `/health` to 503, drains in-flight calls, and exits. The supervisor
 *     (PM2, systemd, Docker, etc.) is expected to start a replacement.
 *
 * @param options Worker configuration — see {@link InertiaSsrWorkerOptions}.
 */
export function createInertiaSsrWorker(options: InertiaSsrWorkerOptions): InertiaSsrWorkerHandle {
  const port = options.port ?? 13714;
  const host = options.host ?? '0.0.0.0';
  const maxRequests = options.maxRequests ?? 1000;
  const maxLifetimeSec = options.maxLifetimeSec ?? 3600;
  const maxRssMb = options.maxRssMb ?? 512;
  const rssCheckIntervalMs = options.rssCheckIntervalMs ?? 10000;
  const drainTimeoutMs = options.drainTimeoutMs ?? 10000;
  const logger = options.logger ?? console;
  const autoExit = options.autoExit ?? true;

  const state: InternalState = {
    draining: false,
    inFlight: 0,
    requestCount: 0,
    startedAt: Date.now(),
    recycled: false,
  };

  let drainResolve: (() => void) | null = null;
  let drainPromise: Promise<void> | null = null;

  /**
   * Begin a graceful recycle: log, fire the `onRecycle` hook, drain, and (if
   * `autoExit`) exit the process. Idempotent — repeat calls return early.
   *
   * @param reason Why the recycle was triggered.
   */
  function triggerRecycle(reason: RecycleReason): void {
    if (state.recycled) {
      return;
    }

    state.recycled = true;
    logger.info?.(`[inertia-ssr-worker] recycling: ${reason}`);
    options.onRecycle?.(reason);
    // `handle` is assigned later in the same scope; this closure only runs at
    // request time, long after initialization completes.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    handle
      .drain()
      .catch((err) => logger.error?.('[inertia-ssr-worker] drain failed', err))
      .finally(() => {
        if (autoExit) {
          // eslint-disable-next-line n/no-process-exit
          process.exit(0);
        }
      });
  }

  /**
   * Recycle the worker once uptime reaches `maxLifetimeSec`. Polled on a timer.
   */
  function checkLifetime(): void {
    if (maxLifetimeSec > 0) {
      const ageSec = (Date.now() - state.startedAt) / 1000;

      if (ageSec >= maxLifetimeSec) {
        triggerRecycle('max-lifetime');
      }
    }
  }

  /**
   * Recycle the worker once resident memory exceeds `maxRssMb`. Polled on a timer.
   */
  function checkRss(): void {
    if (maxRssMb <= 0) {
      return;
    }

    const rssMb = process.memoryUsage().rss / 1024 / 1024;

    if (rssMb >= maxRssMb) {
      triggerRecycle('max-rss');
    }
  }

  let rssTimer: NodeJS.Timeout | null = null;
  let lifetimeTimer: NodeJS.Timeout | null = null;

  /**
   * Collect the full request body as a UTF-8 string.
   *
   * @param req Incoming HTTP request.
   */
  async function readBody(req: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk: Buffer | string) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });
      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      req.on('error', reject);
    });
  }

  /**
   * Write a JSON response with `Content-Type` + `Content-Length` set.
   *
   * @param res Outgoing HTTP response.
   * @param status HTTP status code.
   * @param body Value to JSON-serialize.
   */
  function writeJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(payload));
    res.end(payload);
  }

  /**
   * Write a plain-text response.
   *
   * @param res Outgoing HTTP response.
   * @param status HTTP status code.
   * @param text Response body.
   */
  function writeText(res: ServerResponse, status: number, text: string): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(text);
  }

  /**
   * Process a `POST /render` call: read the page JSON, hand it to the user
   * render function, and write the result. Maintains `inFlight` /
   * `requestCount` and may trigger a `max-requests` recycle when finished.
   *
   * @param req Incoming HTTP request.
   * @param res Outgoing HTTP response.
   */
  async function handleRender(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (state.draining) {
      writeText(res, 503, 'draining');

      return;
    }

    state.inFlight += 1;
    state.requestCount += 1;

    try {
      const raw = await readBody(req);
      let page: InertiaSsrPage;

      try {
        page = JSON.parse(raw) as InertiaSsrPage;
      } catch {
        writeJson(res, 400, { error: 'invalid JSON' });

        return;
      }

      const out = await options.render(page);
      writeJson(res, 200, out);
    } catch (err) {
      logger.error?.('[inertia-ssr-worker] render error', err);
      writeJson(res, 500, {
        error: 'render failed',
        message: (err as Error).message,
      });
    } finally {
      state.inFlight = Math.max(0, state.inFlight - 1);

      if (state.draining && state.inFlight === 0 && drainResolve) {
        drainResolve();
        drainResolve = null;
      }

      if (maxRequests > 0 && state.requestCount >= maxRequests) {
        triggerRecycle('max-requests');
      }
    }
  }

  const server = createServer((req, res) => {
    const url = req.url ?? '';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/health') {
      writeText(res, state.draining ? 503 : 200, state.draining ? 'draining' : 'ok');

      return;
    }

    if (method === 'GET' && url === '/ready') {
      writeText(res, 200, 'ready');

      return;
    }

    if (method === 'POST' && url === '/render') {
      handleRender(req, res).catch((err: unknown) => {
        logger.error?.('[inertia-ssr-worker] unhandled render error', err);
      });

      return;
    }

    writeText(res, 404, 'not found');
  });

  // Don't keep the loop alive solely for the timer.
  if (rssCheckIntervalMs > 0 && maxRssMb > 0) {
    rssTimer = setInterval(checkRss, rssCheckIntervalMs).unref();
  }

  if (maxLifetimeSec > 0) {
    lifetimeTimer = setInterval(checkLifetime, 1000).unref();
  }

  const ready = new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      logger.info?.(
        `[inertia-ssr-worker] listening on ${host}:${port} (max requests: ${maxRequests || '∞'}, max lifetime: ${maxLifetimeSec || '∞'}s, max rss: ${maxRssMb || '∞'} MB)`,
      );
      resolve();
    });
  });

  const handle: InertiaSsrWorkerHandle = {
    get port() {
      const addr = server.address();

      if (addr && typeof addr === 'object') {
        return addr.port;
      }

      return port;
    },
    ready,
    isDraining: () => state.draining,
    async drain(): Promise<void> {
      if (drainPromise) {
        return drainPromise;
      }

      state.draining = true;
      drainPromise = new Promise<void>((resolve) => {
        /** Clear recycle timers and close the HTTP server, then resolve the drain. */
        function done(): void {
          if (rssTimer) {
            clearInterval(rssTimer);
          }

          if (lifetimeTimer) {
            clearInterval(lifetimeTimer);
          }

          server.close(() => resolve());
        }

        if (state.inFlight === 0) {
          done();

          return;
        }

        drainResolve = done;
        setTimeout(() => {
          if (drainResolve) {
            logger.warn?.(
              `[inertia-ssr-worker] drain timeout after ${drainTimeoutMs}ms with ${state.inFlight} in-flight; closing`,
            );
            drainResolve = null;
            done();
          }
        }, drainTimeoutMs).unref();
      });

      return drainPromise;
    },
    async close(): Promise<void> {
      return new Promise((resolve) => {
        if (rssTimer) {
          clearInterval(rssTimer);
        }

        if (lifetimeTimer) {
          clearInterval(lifetimeTimer);
        }

        server.close(() => resolve());
      });
    },
  };

  // Wire SIGTERM/SIGINT to graceful drain so orchestrators (Docker, k8s, ECS)
  // can roll the process cleanly. Idempotent — multiple signals collapse.
  if (autoExit) {
    (['SIGTERM', 'SIGINT'] as const).forEach((sig) => {
      process.once(sig, () => {
        logger.info?.(`[inertia-ssr-worker] received ${sig}, draining`);
        handle
          .drain()
          .catch((err) => logger.error?.('[inertia-ssr-worker] drain failed', err))
          .finally(() => {
            // eslint-disable-next-line n/no-process-exit
            process.exit(0);
          });
      });
    });
  }

  return handle;
}
