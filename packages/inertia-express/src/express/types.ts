import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

import type {
  InertiaPage,
  InertiaRequestInfo,
  PageProps,
  RenderOptions,
  SharedPropsInput,
  SsrCacheStore,
  ValidationErrors,
  VersionResolver,
} from '../core';
import type { EdgeCachePolicy } from './edge-cache.js';

/**
 * Pluggable hook for rendering the page object into the final HTTP body
 * for non-Inertia (i.e. first-load HTML) requests.
 *
 * Adapters can wire this to a template engine. When omitted, a minimal
 * default HTML shell is used.
 */
export type RootViewRenderer = (input: RootViewInput) => string | Promise<string>;

/**
 * Argument passed to a {@link RootViewRenderer}.
 */
export interface RootViewInput {
  page: InertiaPage;
  req: ExpressRequest;
  res: ExpressResponse;
}

/**
 * Output shape from an SSR renderer. Compatible with the format used by the
 * official `@inertiajs/{vue3,react,svelte}/server` packages.
 *
 * `body` may contain either:
 *   - the *inner* HTML of the root element (recommended), or
 *   - the full root element plus the page `<script>` tag (what the Inertia v3
 *     SSR servers emit) — in which case set `bodyIsFullRoot: true` so the
 *     default root view does not wrap it again.
 *
 * `head` may be a string of `<meta>`/`<title>`/`<link>` tags, or an array
 * of strings (Inertia's standard SSR servers return arrays).
 */
export interface SsrResult {
  body: string;
  head?: string | string[];
  bodyIsFullRoot?: boolean;
}

/**
 * Pluggable SSR renderer. Return `null` to skip SSR for this request (e.g.
 * client-only fallback while the SSR server is unavailable).
 */
export type SsrRenderer = (input: SsrRendererInput) => Promise<SsrResult | null>;

/**
 * Argument passed to an {@link SsrRenderer}.
 */
export interface SsrRendererInput {
  page: InertiaPage;
  req: ExpressRequest;
  res: ExpressResponse;
}

/**
 * Configuration for the SSR view cache.
 *
 * On a non-Inertia GET that produces a cache hit, the middleware skips the
 * SSR call entirely and reuses the stored `{ head, body }`. On a miss, the
 * SSR renderer runs and the result is written back to the store.
 *
 * Cache writes are fire-and-forget — failures are logged via `onError` (if
 * provided) but never block the response.
 */
export interface InertiaCacheOptions {
  /** The store implementation. See `createMemoryCacheStore` and `@blacklizard/inertia-cache-redis`. */
  store: SsrCacheStore;
  /** TTL for cache entries in seconds. Default 300. */
  ttlSeconds?: number;
  /** Cache key prefix / namespace. Default `"inertia:ssr"`. */
  keyPrefix?: string;
  /**
   * Decide per request whether the response is cacheable. Return `false`
   * to bypass cache entirely (no read, no write). Default: cache only
   * non-Inertia GET requests on 200 responses. Auth-bound responses,
   * flash data, error Pages should typically opt out here.
   */
  vary?: (input: { req: ExpressRequest; page: InertiaPage }) => boolean;
  /**
   * Optional extra discriminator added to the cache key — useful for
   * locale, theme, A/B bucket, etc. Two requests with the same component
   * + props but different discriminators get separate cache entries.
   */
  discriminator?: (req: ExpressRequest) => string | undefined;
  /** Called when a cache get/set/delete operation throws. Cache failures are non-fatal. */
  onError?: (op: 'get' | 'set' | 'delete', err: unknown) => void;
}

/**
 * Configuration for the Inertia Express middleware. All fields optional.
 */
export interface InertiaMiddlewareOptions {
  /**
   * Asset version. When the client sends a stale `X-Inertia-Version`
   * header on a GET, the middleware responds with 409 + `X-Inertia-Location`
   * to force a full reload.
   *
   * Also incorporated into SSR cache keys so a deploy that bumps the
   * version atomically retires every existing cache entry.
   */
  version?: VersionResolver<ExpressRequest>;

  /**
   * Globally shared props merged into every page's props. May be a static
   * object or a function that receives the current request.
   *
   * Per-page props passed to `res.inertia(component, props)` override
   * shared props on key collisions.
   */
  sharedProps?: SharedPropsInput<ExpressRequest>;

  /**
   * Custom root-view renderer for non-Inertia (first-load) responses.
   * Receives the resolved page object and must return a complete HTML doc.
   */
  rootView?: RootViewRenderer;

  /**
   * Optional SSR hook. When provided, the middleware calls it on
   * non-Inertia (HTML) responses to obtain a pre-rendered `{ head, body }`
   * which is exposed to `rootView` via `res.locals.ssr` and inlined into
   * the default root view if no custom `rootView` is set.
   *
   * Returning `null` from the hook skips SSR for that request — useful
   * for client-only fallback when SSR is unavailable.
   */
  ssr?: SsrRenderer;

  /**
   * Optional view cache. Layered on top of the SSR hook so cached HTML can
   * be served without invoking the SSR renderer at all. See
   * {@link InertiaCacheOptions}.
   */
  cache?: InertiaCacheOptions;

  /**
   * Optional CDN edge-cache policy. Applies `Cache-Control` headers to
   * non-Inertia responses according to the returned decision. Always
   * skipped for Inertia (XHR) responses. Default: no edge caching.
   */
  edgeCache?: EdgeCachePolicy;

  /**
   * If true, merge session-stored validation errors and flash data into the
   * shared props automatically, exposed as the `errors` and `flash` props.
   * Both are read-once — cleared from the session after being read. Explicit
   * `sharedProps` keys win on collision. Off by default.
   */
  flashFromSession?: boolean;
}

/**
 * Per-response options accepted as the third argument to `res.inertia()`.
 * Extends the core {@link RenderOptions} (clearHistory / encryptHistory).
 */
export interface InertiaResponseOptions extends RenderOptions {
  /**
   * Override the URL used in the page object. Defaults to `req.originalUrl`.
   */
  url?: string;
}

/**
 * Render an Inertia page. Returns Promise so handlers can `await` it,
 * but it also calls the underlying Express response methods so
 * `return res.inertia(...)` works in Express handlers.
 */
export type ResInertiaApi = <TProps extends PageProps>(
  component: string,
  props?: TProps,
  options?: InertiaResponseOptions,
) => Promise<void>;

/** Helper to declare typed redirects on the response. */
export type InertiaLocation = (url: string) => void;

/** Render an error page at the given HTTP status. See {@link Response.inertiaError}. */
export type InertiaErrorRenderer = (status: number, message?: string) => Promise<void>;

/**
 * Express-compatible middleware signature that may return a Promise (so
 * `async` handlers can be `.use()`-mounted directly).
 */
export type AsyncMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: (err?: unknown) => void,
) => Promise<void> | void;

declare module 'express-serve-static-core' {
  interface Request {
    /** Parsed Inertia request info, populated by the middleware. */
    inertia?: InertiaRequestInfo;
    /**
     * `connect-flash`-compatible flash API. This package replaces
     * `connect-flash` — see {@link InertiaMiddlewareOptions.flashFromSession}.
     *
     * - `req.flash()` — read and clear every flash bucket.
     * - `req.flash(type)` — read and clear one type's bucket.
     * - `req.flash(type, msg)` — append a message, return the new count.
     * - `req.flash(type, format, ...args)` — append a `util.format`ed message.
     */
    flash: {
      (): Record<string, string[]>;
      (type: string): string[];
      (type: string, message: string | string[]): number;
      (type: string, format: string, ...args: unknown[]): number;
    };
  }
  interface Response {
    /**
     * Render an Inertia page. See {@link ResInertiaApi}.
     */
    inertia: ResInertiaApi;
    /**
     * Trigger an external redirect via the Inertia-Location protocol.
     * Sends 409 with `X-Inertia-Location` for Inertia requests; sends a
     * normal 302 for plain browser requests.
     */
    inertiaLocation: InertiaLocation;
    /**
     * Share validation errors with the client. Helper around setting
     * `req.session.errors`, but framework-agnostic (no session required).
     */
    inertiaErrors: (errors: ValidationErrors, bag?: string) => void;
    /**
     * Stash flash data for the next request. Stored in `req.session.flash`
     * and surfaced as the `flash` shared prop when `flashFromSession` is
     * enabled. Replaces any flash already queued for this redirect.
     * No-ops when no session is wired.
     */
    inertiaFlash: (data: Record<string, unknown>) => void;
    /**
     * Render an error page at the given HTTP status. Inertia requests render
     * the client `Error` component with `status` as a prop; plain loads and
     * render failures fall back to a standalone HTML page. See
     * {@link InertiaErrorRenderer}.
     */
    inertiaError: InertiaErrorRenderer;
  }
}

export type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
