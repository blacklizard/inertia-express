import type { InertiaRequestInfo } from './types.js';

/**
 * Canonical Inertia v3 protocol header names.
 *
 * The Inertia client sends these headers on every visit. The server uses
 * them to decide between a full HTML response and a JSON page response,
 * and to scope partial reloads.
 */
export const INERTIA_HEADERS = {
  inertia: 'x-inertia',
  version: 'x-inertia-version',
  partialComponent: 'x-inertia-partial-component',
  partialData: 'x-inertia-partial-data',
  partialExcept: 'x-inertia-partial-except',
  errorBag: 'x-inertia-error-bag',
  reset: 'x-inertia-reset',
  location: 'x-inertia-location',
} as const;

type HeaderRecord = Record<string, string | string[] | undefined>;

/**
 * Read a header value as a single string, looking up the lowercase variant as
 * a fallback. Returns the first entry of an array value and `null` when the
 * header is absent.
 *
 * @param headers Raw header record from the HTTP layer.
 * @param name Header name to read.
 */
function readHeader(headers: HeaderRecord, name: string): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];

  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

/**
 * Split a comma-separated header value into a trimmed, non-empty string list.
 * Returns `null` when the input is null or yields no entries.
 *
 * @param value Raw header value, or null when absent.
 */
function parseList(value: string | null): string[] | null {
  if (value === null) {
    return null;
  }

  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.length > 0 ? parts : null;
}

/**
 * Parse a request's headers into a normalized {@link InertiaRequestInfo}.
 *
 * @param input Headers, HTTP method, and request URL. Method is uppercased in
 *   the returned object; the URL is passed through unchanged.
 */
export function parseInertiaRequest(input: { headers: HeaderRecord; method: string; url: string }): InertiaRequestInfo {
  const { headers } = input;
  const inertia = readHeader(headers, INERTIA_HEADERS.inertia);
  const version = readHeader(headers, INERTIA_HEADERS.version);
  const partialComponent = readHeader(headers, INERTIA_HEADERS.partialComponent);
  const partialOnly = parseList(readHeader(headers, INERTIA_HEADERS.partialData));
  const partialExcept = parseList(readHeader(headers, INERTIA_HEADERS.partialExcept));
  const errorBag = readHeader(headers, INERTIA_HEADERS.errorBag);
  const resetKeys = parseList(readHeader(headers, INERTIA_HEADERS.reset));

  return {
    isInertia: inertia === 'true' || inertia === '1',
    version,
    partialComponent,
    partialOnly,
    partialExcept,
    errorBag,
    resetKeys,
    method: input.method.toUpperCase(),
    url: input.url,
  };
}
