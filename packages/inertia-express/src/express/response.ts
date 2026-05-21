import {
  buildPage,
  computeSsrCacheKey,
  encodePageScript,
  INERTIA_HEADERS,
  INERTIA_LOCATION_STATUS,
  isVersionMismatch,
  parseInertiaRequest,
  renderDefaultHtml,
  resolveVersion,
} from '../core';
import { applyEdgeCache } from './edge-cache.js';

import type { Request, Response } from 'express';

import type {
  InertiaPage, InertiaRequestInfo, PageProps, SharedPropsInput, SsrCacheEntry,
} from '../core';
import type {
  InertiaCacheOptions, InertiaMiddlewareOptions, InertiaResponseOptions, SsrResult,
} from './types.js';

interface RenderContext {
  options: InertiaMiddlewareOptions;
}

/**
 * Resolve the shared-props input for a request. When `flashFromSession` is
 * enabled, session-stored validation errors and flash data are merged in
 * automatically (read-once — they are cleared after being read). Explicit
 * `sharedProps` keys win on collision.
 *
 * @param ctx Render context carrying the middleware options.
 * @param res Express response, scanned for `res.locals.inertiaErrors` as a
 *   fallback when no session is wired.
 */
function composeSharedProps(ctx: RenderContext, res: Response): SharedPropsInput<Request> {
  const base = ctx.options.sharedProps;

  if (!ctx.options.flashFromSession) {
    return base ?? {};
  }

  return async (req: Request): Promise<PageProps> => {
    let baseProps: PageProps = {};

    if (base) {
      baseProps = typeof base === 'function' ? ((await base(req)) ?? {}) : base;
    }

    const { session } = (req as unknown as { session?: Record<string, unknown> });
    const errors = (session?.errors as PageProps | undefined)
      ?? (res.locals.inertiaErrors as PageProps | undefined)
      ?? {};
    const flash = session?.flash ?? null;

    if (session) {
      // Flash data is read-once: clear it so it does not leak into later visits.
      session.errors = undefined;
      session.flash = undefined;
    }

    return { errors, flash, ...baseProps };
  };
}

/**
 * Send the Inertia version-mismatch response: 409 with `X-Inertia-Location`
 * pointing back at the same URL so the client performs a hard reload.
 *
 * @param res Outgoing Express response.
 * @param url Location to send the client to (typically the requested URL).
 */
export function sendVersionMismatch(res: Response, url: string): void {
  res.status(INERTIA_LOCATION_STATUS).setHeader(INERTIA_HEADERS.location, url).end();
}

/**
 * Send an external Inertia redirect. For Inertia (XHR) requests this returns
 * 409 + `X-Inertia-Location` so the client performs a window.location nav.
 * For plain browser requests it falls back to a normal 302 redirect.
 *
 * @param req Incoming Express request; `req.inertia` is reused when present.
 * @param res Outgoing Express response.
 * @param target Destination URL.
 */
export function sendInertiaLocation(req: Request, res: Response, target: string): void {
  const info = req.inertia
    ?? parseInertiaRequest({
      headers: req.headers,
      method: req.method,
      url: req.originalUrl ?? req.url,
    });

  if (info.isInertia) {
    res.status(INERTIA_LOCATION_STATUS).setHeader(INERTIA_HEADERS.location, target).end();

    return;
  }

  res.redirect(302, target);
}

/**
 * Merge `Accept` and `X-Inertia` into an existing `Vary` header value,
 * deduplicating case-insensitively so the header never accumulates repeats
 * when the middleware and the response both contribute tokens.
 *
 * @param existing Current header value as Node returns it (string, number,
 *   string[], or undefined).
 */
function mergeVary(existing: string | number | string[] | undefined): string {
  const tokens: string[] = [];
  const seen = new Set<string>();

  const add = (token: string): void => {
    const trimmed = token.trim();
    const key = trimmed.toLowerCase();

    if (trimmed && !seen.has(key)) {
      seen.add(key);
      tokens.push(trimmed);
    }
  };

  if (existing !== undefined) {
    String(existing).split(',').forEach((part) => add(part));
  }

  add('Accept');
  add('X-Inertia');

  return tokens.join(', ');
}

/**
 * Coerce SSR head output (string, string[], or absent) to a single string
 * suitable for injection into the document `<head>`.
 *
 * @param head Head fragment(s) from the SSR renderer.
 */
function flattenSsrHead(head: string | string[] | undefined): string | undefined {
  if (head === undefined) {
    return undefined;
  }

  if (Array.isArray(head)) {
    return head.join('');
  }

  return head;
}

/**
 * Default rule deciding whether a rendered page is safe to cache. Cacheable
 * iff the request is a non-Inertia GET and the page carries no flash
 * messages or validation errors (those are per-visit state).
 *
 * @param input Express request and the resolved page object.
 */
function defaultCacheVary(input: { req: Request; page: InertiaPage }): boolean {
  const { req, page } = input;

  if (req.method !== 'GET') {
    return false;
  }

  // Inertia XHR (JSON) responses vary per visit — caching them at the view
  // layer would serve stale partial reloads to the wrong client.
  if (req.inertia?.isInertia) {
    return false;
  }

  const props = page.props as Record<string, unknown>;

  if (props && typeof props === 'object') {
    const flash = props.flash as Record<string, unknown> | undefined;

    if (flash && Object.keys(flash).length > 0) {
      return false;
    }

    const errors = props.errors as Record<string, unknown> | undefined;

    if (errors && Object.keys(errors).length > 0) {
      return false;
    }
  }

  return true;
}

/**
 * Wrap `cache.store.get` so a thrown store error is reported via `onError`
 * and reported as a miss instead of bubbling out to the request handler.
 *
 * @param cache Resolved cache options.
 * @param key Cache key.
 */
async function safeCacheGet(cache: InertiaCacheOptions, key: string): Promise<SsrCacheEntry | null> {
  try {
    return await cache.store.get(key);
  } catch (err) {
    cache.onError?.('get', err);

    return null;
  }
}

/**
 * Wrap `cache.store.set` so a thrown store error is reported via `onError`
 * but never propagates — cache writes are fire-and-forget.
 *
 * @param cache Resolved cache options.
 * @param key Cache key.
 * @param entry Value to store.
 * @param ttl Time-to-live in seconds.
 */
async function safeCacheSet(cache: InertiaCacheOptions, key: string, entry: SsrCacheEntry, ttl: number): Promise<void> {
  try {
    await cache.store.set(key, entry, ttl);
  } catch (err) {
    cache.onError?.('set', err);
  }
}

/**
 * Render the final HTML body. When an SSR result is available, expose it via
 * `res.locals.ssr` so a custom `rootView` can read it, then either call
 * `rootView` or fall back to {@link renderDefaultHtml}.
 *
 * @param ctx Render context carrying the middleware options.
 * @param page Resolved page object.
 * @param ssrResult SSR renderer output, or `null` when SSR is skipped.
 * @param req Incoming request.
 * @param res Outgoing response.
 */
async function renderRootViewWithSsr(
  ctx: RenderContext,
  page: InertiaPage,
  ssrResult: SsrResult | null,
  req: Request,
  res: Response,
): Promise<string> {
  if (ssrResult) {
    res.locals.ssr = ssrResult;

    if (ctx.options.rootView) {
      return ctx.options.rootView({ page, req, res });
    }

    return renderDefaultHtml({
      page,
      head: flattenSsrHead(ssrResult.head),
      ssrBody: ssrResult.bodyIsFullRoot ? undefined : ssrResult.body,
      ssrFull: ssrResult.bodyIsFullRoot ? ssrResult.body : undefined,
    });
  }

  if (ctx.options.rootView) {
    return ctx.options.rootView({ page, req, res });
  }

  return renderDefaultHtml({ page });
}

/**
 * Apply the configured `edgeCache` policy unless this is an Inertia XHR
 * response (those vary per visit and must not be cached at the edge).
 *
 * @param ctx Render context carrying the middleware options.
 * @param page Resolved page object.
 * @param req Incoming request.
 * @param res Outgoing response.
 */
function maybeApplyEdgeCache(ctx: RenderContext, page: InertiaPage, req: Request, res: Response): void {
  if (!ctx.options.edgeCache) {
    return;
  }

  if (req.inertia?.isInertia) {
    return;
  }

  const decision = ctx.options.edgeCache({ req, res, page });
  applyEdgeCache(decision, res);
}

/**
 * Build and send an Inertia response. Handles version-mismatch detection,
 * partial-reload filtering, JSON vs HTML, SSR, view caching, and edge
 * cache headers. The status code already on `res` (e.g. `res.status(404)`)
 * is preserved on both the JSON and HTML branches.
 *
 * @param req Incoming Express request.
 * @param res Outgoing Express response.
 * @param ctx Render context carrying the middleware options.
 * @param component Inertia component name to render.
 * @param props Page-specific props (merged with shared props).
 * @param options Optional per-response overrides (url, clearHistory, encryptHistory).
 */
export async function sendInertiaResponse(
  req: Request,
  res: Response,
  ctx: RenderContext,
  component: string,
  props: PageProps,
  options: InertiaResponseOptions = {},
): Promise<void> {
  const info: InertiaRequestInfo = req.inertia
    ?? parseInertiaRequest({
      headers: req.headers,
      method: req.method,
      url: options.url ?? req.originalUrl ?? req.url,
    });

  const url = options.url ?? info.url;
  const version = await resolveVersion(ctx.options.version, req);

  if (info.isInertia && info.method === 'GET' && isVersionMismatch(version, info.version)) {
    sendVersionMismatch(res, url);

    return;
  }

  const page = await buildPage<Request>({
    component,
    props,
    request: { ...info, url },
    req,
    shared: composeSharedProps(ctx, res),
    version,
    options: {
      clearHistory: options.clearHistory,
      encryptHistory: options.encryptHistory,
    },
  });

  res.setHeader('Vary', mergeVary(res.getHeader('Vary')));

  if (info.isInertia) {
    res
      .status(res.statusCode)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader(INERTIA_HEADERS.inertia, 'true');
    res.send(JSON.stringify(page));

    return;
  }

  // HTML branch — SSR + cache.
  const { cache } = ctx.options;
  const cacheVary = cache?.vary ?? defaultCacheVary;
  const cacheable = cache !== undefined && cacheVary({ req, page });
  let cacheKey: string | null = null;

  if (cacheable && cache) {
    cacheKey = computeSsrCacheKey({
      prefix: cache.keyPrefix ?? 'inertia:ssr',
      version,
      component,
      props: page.props,
      discriminator: cache.discriminator?.(req),
    });
    const hit = await safeCacheGet(cache, cacheKey);

    if (hit) {
      res.setHeader('X-Inertia-Cache', 'HIT');
      const html = await renderRootViewWithSsr(
        ctx,
        hit.page,
        {
          head: hit.head,
          body: hit.body,
          bodyIsFullRoot: hit.bodyIsFullRoot,
        },
        req,
        res,
      );
      maybeApplyEdgeCache(ctx, hit.page, req, res);
      res.status(res.statusCode).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);

      return;
    }

    res.setHeader('X-Inertia-Cache', 'MISS');
  }

  let ssrResult: SsrResult | null = null;

  if (ctx.options.ssr) {
    ssrResult = await ctx.options.ssr({ page, req, res });
  }

  const html = await renderRootViewWithSsr(ctx, page, ssrResult, req, res);

  if (cacheable && cache && cacheKey && ssrResult) {
    const entry: SsrCacheEntry = {
      head: ssrResult.head ?? '',
      body: ssrResult.body,
      bodyIsFullRoot: ssrResult.bodyIsFullRoot,
      storedAt: new Date().toISOString(),
      page,
    };
    // Fire-and-forget — safeCacheSet swallows its own errors.
    safeCacheSet(cache, cacheKey, entry, cache.ttlSeconds ?? 300).catch(() => {});
  }

  maybeApplyEdgeCache(ctx, page, req, res);
  res.status(res.statusCode).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
}

export { encodePageScript };
