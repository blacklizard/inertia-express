import { createHash } from 'node:crypto';

import type { InertiaPage, PageProps } from './types.js';

/**
 * Pluggable storage interface for the SSR view cache.
 *
 * Implementations live outside the core package — see
 * `createMemoryCacheStore` in `@blacklizard/inertia-express` and
 * `createRedisCacheStore` in `@blacklizard/inertia-cache-redis`.
 *
 * Values are arbitrary JSON — usually `SsrCacheEntry` (`{ head, body, ... }`).
 * The store should not interpret them.
 */
export interface SsrCacheStore {
  get: (key: string) => Promise<SsrCacheEntry | null>;
  set: (key: string, value: SsrCacheEntry, ttlSeconds: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

/**
 * What we actually store per cache hit. Includes everything needed to
 * reconstruct the HTML response without re-running the SSR renderer.
 */
export interface SsrCacheEntry {
  head: string | string[];
  body: string;
  bodyIsFullRoot?: boolean;
  /** ISO timestamp when this entry was stored. Useful for debugging. */
  storedAt: string;
  /**
   * The page object the entry corresponds to. Lets a custom rootView see
   * the same structure on a cache hit as on a fresh render.
   */
  page: InertiaPage;
}

/**
 * Recursively normalize a value so equal-by-value inputs serialize identically:
 * object keys are sorted, `undefined` properties are dropped, and non-finite
 * numbers collapse to `null`.
 *
 * @param value Arbitrary JSON-shaped input.
 */
function canonicalize(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  const obj = value as Record<string, unknown>;

  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .filter((key) => obj[key] !== undefined)
      .map((key) => [key, canonicalize(obj[key])]),
  );
}

/**
 * Stable JSON encoding: keys sorted recursively, undefined dropped, NaN/Inf
 * normalized. Two equal-by-value objects always produce the same string,
 * so they hash to the same cache key.
 *
 * @param value Arbitrary JSON-shaped input.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Inputs to {@link computeSsrCacheKey}.
 */
export interface ComputeCacheKeyInput {
  /** Cache namespace, e.g. `"inertia:ssr"`. */
  prefix: string;
  /** Asset version. Becomes part of the key so deploys auto-invalidate. */
  version: string | null;
  /** Component name being rendered. */
  component: string;
  /** Final, fully-resolved props (post shared-merge, post-lazy evaluation). */
  props: PageProps;
  /** Optional extra discriminator (locale, theme, A/B bucket, etc.). */
  discriminator?: string;
}

/**
 * Build the cache key for an SSR cache entry.
 *
 * Shape: `${prefix}:${version}:${component}:${sha256(props[+discriminator])}`
 *
 * Including `version` in the key namespace means a deploy that bumps the
 * asset version atomically retires every old key — no flush, no race.
 *
 * @param input Prefix, version, component, resolved props, optional discriminator.
 */
export function computeSsrCacheKey(input: ComputeCacheKeyInput): string {
  const versionPart = input.version ?? '_';
  const propsHash = createHash('sha256')
    .update(canonicalStringify(input.props))
    .update(input.discriminator ?? '')
    .digest('hex')
    .slice(0, 32);

  return `${input.prefix}:${versionPart}:${input.component}:${propsHash}`;
}
