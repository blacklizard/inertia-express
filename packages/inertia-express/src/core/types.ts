/**
 * Inertia.js v3 protocol types.
 *
 * Reference: https://inertiajs.com/the-protocol
 */

/**
 * Free-form bag of page props handed to the client component.
 */
export type PageProps = Record<string, unknown>;

/**
 * The page object returned to the Inertia client (for `X-Inertia` requests)
 * or embedded into the initial HTML response on first load.
 */
export interface InertiaPage<TProps extends PageProps = PageProps> {
  component: string;
  props: TProps;
  url: string;
  version: string | null;
  /**
   * v3: instructs the client to clear browser history state on this visit.
   */
  clearHistory: boolean;
  /**
   * v3: instructs the client to encrypt history state for this page.
   */
  encryptHistory: boolean;
  /**
   * v3: instructs the client to preserve the URL fragment across this visit.
   */
  preserveFragment: boolean;
  /**
   * v3: top-level keys of props that came from shared props.
   */
  sharedProps?: string[];
  /**
   * v3: keys whose props should be merged (appended) on the client rather than replaced.
   */
  mergeProps?: string[];
  /**
   * v3: keys whose props should be prepended on the client rather than replaced.
   */
  prependProps?: string[];
  /**
   * v3: keys whose props should be *deep*-merged on the client (recursive merge
   * rather than shallow append).
   */
  deepMergeProps?: string[];
  /**
   * v3: dotted `prop.field` paths telling the client which field to match on
   * when merging arrays of objects (used to dedupe rather than blindly append).
   */
  matchPropsOn?: string[];
  /**
   * v3: keys whose props should be deferred and fetched in a follow-up partial reload.
   *    Grouped by deferred-load group name.
   */
  deferredProps?: Record<string, string[]>;
  /**
   * v3: keys of props whose resolution failed and was rescued by the server.
   */
  rescuedProps?: string[];
  /**
   * v3: infinite-scroll pagination metadata, keyed by prop path.
   */
  scrollProps?: Record<string, ScrollMetadata & { reset: boolean }>;
  /**
   * v3: once-prop metadata, keyed by once key.
   */
  onceProps?: Record<string, OnceMetadata>;
  /**
   * Read-once flash data, surfaced as a *top-level* page key (sibling to
   * `props`) rather than a prop — mirroring inertia-laravel's
   * `Response::resolveFlashData`. Omitted entirely when there is no flash.
   */
  flash?: unknown;
  /**
   * v3 live props: per-prop realtime channel listeners, keyed by prop path.
   */
  liveProps?: Record<string, LiveMetadata>;
}

/**
 * Globally shared props: either a static object merged into every page, or
 * a (possibly async) function that returns one for the current request.
 */
export type SharedPropsInput<TReq = unknown> = PageProps | ((req: TReq) => PageProps | Promise<PageProps>);

/**
 * Infinite-scroll pagination metadata for one scroll prop.
 */
export interface ScrollMetadata {
  pageName: string;
  previousPage: number | string | null;
  nextPage: number | string | null;
  currentPage: number | string | null;
}

/**
 * Metadata for one once-prop: the prop path it resolves and its expiry as a
 * millisecond epoch timestamp, or `null` when it never expires.
 */
export interface OnceMetadata {
  prop: string;
  expiresAt: number | null;
}

/**
 * Broadcast channel visibility: `public`, `private`, `presence`, or
 * `encrypted-private`.
 */
export type LiveChannelType = 'public' | 'private' | 'presence' | 'encrypted-private';

/**
 * A named realtime channel a live prop subscribes to.
 */
export interface LiveChannel {
  /** Channel name as known to the realtime broadcaster. */
  name: string;
  /** Visibility of the channel. */
  type: LiveChannelType;
}

/**
 * One channel subscription for a live prop: the channel and the event names
 * that trigger a refresh.
 */
export interface LiveListener {
  /** Channel to subscribe to. */
  channel: LiveChannel;
  /** Event names on the channel that trigger a refresh of the prop. */
  events: string[];
}

/**
 * Live-prop metadata for one prop path: its listeners and an optional refresh
 * throttle in milliseconds.
 */
export interface LiveMetadata {
  /** Channel subscriptions for this prop. */
  listeners: LiveListener[];
  /** Minimum milliseconds between refreshes of this prop, when set. */
  throttle?: number;
}

/**
 * Page-level metadata produced while resolving props; every key is omitted
 * when empty.
 */
export interface PropsMetadata {
  sharedProps?: string[];
  mergeProps?: string[];
  prependProps?: string[];
  deepMergeProps?: string[];
  matchPropsOn?: string[];
  deferredProps?: Record<string, string[]>;
  rescuedProps?: string[];
  scrollProps?: Record<string, ScrollMetadata & { reset: boolean }>;
  onceProps?: Record<string, OnceMetadata>;
  liveProps?: Record<string, LiveMetadata>;
}

/**
 * Callback invoked when a rescued prop throws during resolution. The hook's
 * own failures are contained: a synchronous throw or a rejected returned
 * promise is logged through the default reporter (`console.error`) and never
 * propagates or surfaces as an unhandled rejection.
 *
 * @param error The thrown value.
 * @param path Dotted path of the prop that failed.
 */
export type RescueHandler = (error: unknown, path: string) => void;

/**
 * Per-response overrides for history-related page flags.
 */
export interface RenderOptions {
  /**
   * Override `clearHistory` for this response.
   */
  clearHistory?: boolean;
  /**
   * Override `encryptHistory` for this response.
   */
  encryptHistory?: boolean;
  /**
   * Override `preserveFragment` for this response.
   */
  preserveFragment?: boolean;
}

/**
 * Normalized view of an incoming HTTP request from the perspective of the
 * Inertia v3 protocol. Produced by {@link parseInertiaRequest}.
 */
export interface InertiaRequestInfo {
  isInertia: boolean;
  version: string | null;
  partialComponent: string | null;
  partialOnly: string[] | null;
  partialExcept: string[] | null;
  errorBag: string | null;
  resetKeys: string[] | null;
  /**
   * Once-prop keys the client already holds (`X-Inertia-Except-Once-Props`);
   * `[]` when the header is absent.
   */
  exceptOnceProps: string[];
  /**
   * Infinite-scroll merge direction (`X-Inertia-Infinite-Scroll-Merge-Intent`);
   * `'prepend'` only on that exact value, otherwise `'append'`.
   */
  mergeIntent: 'append' | 'prepend';
  /**
   * True when `Purpose`, `Sec-Purpose` or `X-Moz` equals `prefetch`
   * (case-insensitive).
   */
  isPrefetch: boolean;
  /**
   * Socket id from `X-Socket-Id`, or `null` when absent. The adapter only
   * parses it; live-prop code consumes it.
   */
  socketId: string | null;
  method: string;
  url: string;
}

/**
 * Asset version source: a literal string, `null` (disables checks), or a
 * (possibly async) function that derives a version per request.
 */
export type VersionResolver<TReq = unknown> = | string
  | null
  | (() => string | null | Promise<string | null>)
  | ((req: TReq) => string | null | Promise<string | null>);
