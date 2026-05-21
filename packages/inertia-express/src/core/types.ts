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
   * v3: keys whose props should be deferred and fetched in a follow-up partial reload.
   *    Grouped by deferred-load group name.
   */
  deferredProps?: Record<string, string[]>;
  /**
   * v3: keys whose props should be merged (appended) on the client rather than replaced.
   */
  mergeProps?: string[];
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
}

/**
 * A prop value that is evaluated lazily on every visit.
 */
export type LazyProp<T = unknown> = (() => T | Promise<T>) & {
  __inertia_lazy: true;
};

/**
 * A prop value that is only sent on partial reloads when explicitly requested
 * (i.e. its key appears in `X-Inertia-Partial-Data`). On full visits the prop
 * is omitted entirely.
 */
export type OptionalProp<T = unknown> = (() => T | Promise<T>) & {
  __inertia_optional: true;
};

/**
 * A prop that is omitted on the initial visit and instead loaded by an
 * automatic follow-up partial reload after the page mounts. Grouped by
 * `group` so several deferred props can be loaded in a single round-trip.
 */
export type DeferredProp<T = unknown> = (() => T | Promise<T>) & {
  __inertia_deferred: true;
  group: string;
};

/**
 * A prop that is always included in the response — on full visits and on
 * partial reloads — regardless of `X-Inertia-Partial-Data` /
 * `X-Inertia-Partial-Except` filtering.
 */
export type AlwaysProp<T = unknown> = (() => T | Promise<T>) & {
  __inertia_always: true;
};

/**
 * A prop value the client should *append* to existing data rather than
 * replace (useful for paginated lists).
 */
export type MergeProp<T = unknown> = T & {
  __inertia_merge: true;
  __inertia_match_on?: string[];
};

/**
 * A prop value the client should recursively *deep*-merge into existing data
 * rather than shallow-append.
 */
export type DeepMergeProp<T = unknown> = T & {
  __inertia_deep_merge: true;
  __inertia_match_on?: string[];
};

/**
 * Any value accepted as a page prop: a plain JSON value, or one of the
 * wrapper types ({@link LazyProp}, {@link OptionalProp}, {@link DeferredProp},
 * {@link AlwaysProp}, {@link MergeProp}, {@link DeepMergeProp}). Structurally
 * this is `unknown` — the wrappers are documented here for discoverability.
 */
export type PropValue = unknown;

/**
 * Globally shared props: either a static object merged into every page, or
 * a (possibly async) function that returns one for the current request.
 */
export type SharedPropsInput<TReq = unknown> = PageProps | ((req: TReq) => PageProps | Promise<PageProps>);

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
