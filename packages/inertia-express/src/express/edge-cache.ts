import type { Request, Response } from 'express';

import type { InertiaPage } from '../core/index.js';

/**
 * Decision returned by an `edgeCache` policy. Returning `null` (or a
 * negative number) opts out of edge caching — no `Cache-Control` is set
 * beyond what your handler set itself.
 */
export interface EdgeCacheDecision {
  /** `s-maxage` value for shared/CDN caches, in seconds. */
  sMaxAge: number;
  /** `max-age` for the browser cache. Default 0 (revalidate immediately). */
  maxAge?: number;
  /**
   * `stale-while-revalidate` window. Lets CDNs serve a slightly stale
   * response while fetching a fresh one in the background.
   */
  staleWhileRevalidate?: number;
  /**
   * Additional `Vary` values. The middleware always emits `Vary: Accept,
   * X-Inertia` — this lets you append more (e.g. `Cookie`, `Accept-Language`).
   */
  vary?: string[];
}

/**
 * Per-response edge-cache decision: receives the request, response, and
 * resolved page, returns an {@link EdgeCacheDecision} or `null` to opt out.
 */
export type EdgeCachePolicy = (input: { req: Request; res: Response; page: InertiaPage }) => EdgeCacheDecision | null;

/**
 * Apply an edge-cache decision to the response. Called automatically by
 * the middleware when an `edgeCache` policy is configured. Exported so
 * you can call it from custom code paths too.
 *
 * No-op when `decision` is `null`, when `sMaxAge <= 0`, or when the response
 * is 3xx+ (4xx/5xx must not be cached at the edge). The middleware also skips
 * Inertia XHR responses before calling this — that filter lives at the call
 * site, not here, since `applyEdgeCache` only sees the decision + status.
 *
 * `Vary` values from the decision are merged into the existing header,
 * de-duplicated by trimmed string.
 *
 * @param decision Policy output (or `null` to opt out).
 * @param res Outgoing Express response (mutated: sets `Cache-Control`, `Vary`).
 */
export function applyEdgeCache(decision: EdgeCacheDecision | null, res: Response): void {
  if (decision === null || decision.sMaxAge <= 0) {
    return;
  }

  if (res.statusCode >= 300) {
    return;
  }

  const parts: string[] = ['public', `s-maxage=${decision.sMaxAge}`, `max-age=${decision.maxAge ?? 0}`];

  if (decision.staleWhileRevalidate && decision.staleWhileRevalidate > 0) {
    parts.push(`stale-while-revalidate=${decision.staleWhileRevalidate}`);
  }

  res.setHeader('Cache-Control', parts.join(', '));

  if (decision.vary && decision.vary.length > 0) {
    const existing = res.getHeader('Vary');
    const all = new Set<string>();

    if (typeof existing === 'string') {
      existing.split(',').forEach((v) => all.add(v.trim()));
    }

    decision.vary.forEach((v) => {
      const trimmed = v.trim();

      if (trimmed) {
        all.add(trimmed);
      }
    });

    res.setHeader('Vary', Array.from(all).join(', '));
  }
}
