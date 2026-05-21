import type {
  AlwaysProp,
  DeepMergeProp,
  DeferredProp,
  InertiaRequestInfo,
  LazyProp,
  MergeProp,
  OptionalProp,
  PageProps,
} from './types.js';

const LAZY = '__inertia_lazy' as const;
const OPTIONAL = '__inertia_optional' as const;
const DEFERRED = '__inertia_deferred' as const;
const ALWAYS = '__inertia_always' as const;
const MERGE = '__inertia_merge' as const;
const DEEP_MERGE = '__inertia_deep_merge' as const;
const MATCH_ON = '__inertia_match_on' as const;

/**
 * Attach the (non-enumerable) `MATCH_ON` symbol-key to a merge/deep-merge
 * prop value so `resolveProps` can emit the dotted `prop.field` paths.
 *
 * @param value Object being tagged (mutated in place).
 * @param matchOn Single field name or list; no-op when undefined.
 */
function tagMatchOn(value: object, matchOn: string | string[] | undefined): void {
  if (matchOn === undefined) {
    return;
  }

  const fields = Array.isArray(matchOn) ? matchOn : [matchOn];
  Object.defineProperty(value, MATCH_ON, { value: fields, enumerable: false });
}

/**
 * Wrap a value-producing function as a "lazy" prop.
 *
 * Lazy props are evaluated on every visit (full or partial) when included.
 * They are NOT skipped on the initial visit — use {@link optional} for that.
 *
 * @param fn Producer called (and awaited) when the prop is included.
 */
export function lazy<T>(fn: () => T | Promise<T>): LazyProp<T> {
  const wrapped = (async () => fn()) as LazyProp<T>;
  Object.defineProperty(wrapped, LAZY, { value: true, enumerable: false });

  return wrapped;
}

/**
 * Wrap a value-producing function as an "optional" prop.
 *
 * Optional props are omitted from the initial response and only included
 * when explicitly requested via `X-Inertia-Partial-Data`.
 *
 * @param fn Producer called (and awaited) on partial reloads that request the key.
 */
export function optional<T>(fn: () => T | Promise<T>): OptionalProp<T> {
  const wrapped = (async () => fn()) as OptionalProp<T>;
  Object.defineProperty(wrapped, OPTIONAL, { value: true, enumerable: false });

  return wrapped;
}

/**
 * Wrap a value-producing function as a "deferred" prop.
 *
 * Deferred props are omitted from the initial visit. The client receives
 * the list of deferred prop keys (grouped by `group`) in the page object
 * and triggers an automatic partial reload to fetch them.
 *
 * @param fn Producer called (and awaited) on the deferred follow-up reload.
 * @param group Load-group name; keys in the same group are fetched in one round-trip.
 */
export function defer<T>(fn: () => T | Promise<T>, group = 'default'): DeferredProp<T> {
  const wrapped = (async () => fn()) as DeferredProp<T>;
  Object.defineProperty(wrapped, DEFERRED, { value: true, enumerable: false });
  Object.defineProperty(wrapped, 'group', { value: group, enumerable: false });

  return wrapped;
}

/**
 * Wrap a value-producing function as an "always" prop.
 *
 * Always props are included on every response — full visits and partial
 * reloads alike — regardless of `X-Inertia-Partial-Data` /
 * `X-Inertia-Partial-Except` filtering.
 *
 * @param fn Producer called (and awaited) on every visit.
 */
export function always<T>(fn: () => T | Promise<T>): AlwaysProp<T> {
  const wrapped = (async () => fn()) as AlwaysProp<T>;
  Object.defineProperty(wrapped, ALWAYS, { value: true, enumerable: false });

  return wrapped;
}

/**
 * Mark a value as a "merge" prop. The Inertia client will append the new
 * value to the existing prop (typically used for paginated arrays).
 *
 * Pass `matchOn` (a field name or list of field names) to have the client
 * dedupe array items on that field instead of blindly appending.
 *
 * @param value Object or array to tag (mutated in place via non-enumerable properties).
 * @param matchOn Optional field name(s) to dedupe on.
 */
export function merge<T extends object>(value: T, matchOn?: string | string[]): MergeProp<T> {
  const tagged = value as MergeProp<T>;
  Object.defineProperty(tagged, MERGE, { value: true, enumerable: false });
  tagMatchOn(tagged, matchOn);

  return tagged;
}

/**
 * Mark a value as a "deep merge" prop. The Inertia client recursively merges
 * the new value into the existing prop rather than shallow-appending.
 *
 * Pass `matchOn` (a field name or list of field names) to have the client
 * dedupe array items on that field.
 *
 * @param value Object or array to tag (mutated in place via non-enumerable properties).
 * @param matchOn Optional field name(s) to dedupe on.
 */
export function deepMerge<T extends object>(value: T, matchOn?: string | string[]): DeepMergeProp<T> {
  const tagged = value as DeepMergeProp<T>;
  Object.defineProperty(tagged, DEEP_MERGE, { value: true, enumerable: false });
  tagMatchOn(tagged, matchOn);

  return tagged;
}

/**
 * Type guard: `true` when `v` is a {@link lazy} prop wrapper.
 *
 * @param v Value to test.
 */
function isLazy(v: unknown): v is LazyProp {
  return typeof v === 'function' && (v as { [LAZY]?: boolean })[LAZY] === true;
}

/**
 * Type guard: `true` when `v` is an {@link optional} prop wrapper.
 *
 * @param v Value to test.
 */
function isOptional(v: unknown): v is OptionalProp {
  return typeof v === 'function' && (v as { [OPTIONAL]?: boolean })[OPTIONAL] === true;
}

/**
 * Type guard: `true` when `v` is a {@link defer} prop wrapper.
 *
 * @param v Value to test.
 */
function isDeferred(v: unknown): v is DeferredProp {
  return typeof v === 'function' && (v as { [DEFERRED]?: boolean })[DEFERRED] === true;
}

/**
 * Type guard: `true` when `v` is an {@link always} prop wrapper.
 *
 * @param v Value to test.
 */
function isAlways(v: unknown): v is AlwaysProp {
  return typeof v === 'function' && (v as { [ALWAYS]?: boolean })[ALWAYS] === true;
}

/**
 * Type guard: `true` when `v` is a {@link merge} prop wrapper.
 *
 * @param v Value to test.
 */
function isMerge(v: unknown): v is MergeProp {
  return v !== null && typeof v === 'object' && (v as { [MERGE]?: boolean })[MERGE] === true;
}

/**
 * Type guard: `true` when `v` is a {@link deepMerge} prop wrapper.
 *
 * @param v Value to test.
 */
function isDeepMerge(v: unknown): v is DeepMergeProp {
  return v !== null && typeof v === 'object' && (v as { [DEEP_MERGE]?: boolean })[DEEP_MERGE] === true;
}

/**
 * Match a prop key against a partial-reload key list. A pattern matches when
 * it equals the key, or when it is a dotted path into the key (`users.data`
 * matches the `users` prop). Mirrors the official adapter's partial filtering.
 *
 * @param patterns Key patterns from `X-Inertia-Partial-Data` / `-Partial-Except`.
 * @param key Prop key being tested.
 */
function partialKeyMatches(patterns: string[], key: string): boolean {
  return patterns.some((pattern) => pattern === key || pattern.startsWith(`${key}.`));
}

/**
 * Read the non-enumerable `MATCH_ON` field-list off a tagged merge value,
 * returning an empty array when absent.
 *
 * @param v Possibly-tagged merge / deep-merge prop value.
 */
function readMatchOn(v: unknown): string[] {
  if (v === null || typeof v !== 'object') {
    return [];
  }

  const fields = (v as { [MATCH_ON]?: string[] })[MATCH_ON];

  return Array.isArray(fields) ? fields : [];
}

/**
 * Inputs to {@link resolveProps}.
 */
export interface ResolvePropsInput {
  /** Props passed to `res.inertia(component, props)`. */
  props: PageProps;
  /** Globally shared props after evaluation. */
  shared: PageProps;
  /** The component name being rendered. */
  component: string;
  /** Parsed Inertia request info. */
  request: InertiaRequestInfo;
}

/**
 * Result of {@link resolveProps}: the evaluated props plus the per-key
 * metadata the caller needs to populate the page object.
 */
export interface ResolvePropsResult {
  props: PageProps;
  /** Deferred prop key map by group, for the initial visit. */
  deferred: Record<string, string[]>;
  /** Shallow-merge prop key list. */
  merge: string[];
  /** Deep-merge prop key list. */
  deepMerge: string[];
  /** Dotted `prop.field` match-on paths for merge/deep-merge props. */
  matchOn: string[];
}

/**
 * Combine shared + page props, then apply partial-reload filtering and
 * lazy/optional/deferred evaluation per the Inertia v3 protocol.
 *
 * Resolution order matches the official adapters:
 * 1. Merge shared and page props (page wins on collision).
 * 2. Determine if this is a partial reload for the same component.
 * 3. For non-partial visits: drop optional and deferred props; keep everything
 *    else (lazy props are evaluated).
 * 4. For partial visits: keep only keys in `partialOnly` (if set), then drop
 *    keys in `partialExcept`. Optional props are now eligible.
 * 5. Evaluate every remaining function-shaped prop
 *    (lazy/optional/deferred/always) by calling it and awaiting the result.
 *    Independent props are evaluated in parallel via `Promise.all`.
 * 6. Collect merge / deep-merge / match-on keys, excluding any key the client
 *    listed in `X-Inertia-Reset` — those props are reset (replaced) rather
 *    than appended.
 *
 * @param input Page + shared props, the component name, and parsed request info.
 */
export async function resolveProps(input: ResolvePropsInput): Promise<ResolvePropsResult> {
  const {
    props, shared, component, request,
  } = input;

  const combined: PageProps = { ...shared, ...props };

  const isPartial = request.isInertia && request.partialComponent !== null && request.partialComponent === component;

  const deferred: Record<string, string[]> = {};
  const mergeKeys: string[] = [];
  const deepMergeKeys: string[] = [];
  const matchOnKeys: string[] = [];
  const filtered: PageProps = {};

  const isExcludedFromPartial = (key: string, value: unknown): boolean => {
    if (!isPartial || isAlways(value)) {
      return false;
    }

    if (request.partialOnly !== null && !partialKeyMatches(request.partialOnly, key)) {
      return true;
    }

    return request.partialExcept !== null && partialKeyMatches(request.partialExcept, key);
  };

  Object.entries(combined).forEach(([key, value]) => {
    // Track deferred prop keys for the page object (only on initial visits).
    // On a partial reload that requests the key, it is evaluated like a lazy prop.
    if (isDeferred(value) && !isPartial) {
      (deferred[value.group] ??= []).push(key);

      return;
    }

    // Optional props never appear on full visits.
    if (isOptional(value) && !isPartial) {
      return;
    }

    if (isExcludedFromPartial(key, value)) {
      return;
    }

    filtered[key] = value;
  });

  const { resetKeys } = request;
  const evaluated: PageProps = {};

  // Evaluate every function-shaped prop; independent props resolve in parallel.
  const resolvedEntries = await Promise.all(
    Object.entries(filtered).map(async ([key, value]): Promise<readonly [string, unknown]> => {
      const needsEval = isLazy(value) || isOptional(value) || isDeferred(value) || isAlways(value);
      const resolved: unknown = needsEval ? await (value as () => unknown)() : value;

      return [key, resolved] as const;
    }),
  );

  resolvedEntries.forEach(([key, resolved]) => {
    evaluated[key] = resolved;

    const isReset = resetKeys?.includes(key) ?? false;

    if (isReset) {
      return;
    }

    const merging = isMerge(resolved);
    const deepMerging = isDeepMerge(resolved);

    if (merging) {
      mergeKeys.push(key);
    } else if (deepMerging) {
      deepMergeKeys.push(key);
    }

    if (merging || deepMerging) {
      readMatchOn(resolved).forEach((field) => {
        matchOnKeys.push(`${key}.${field}`);
      });
    }
  });

  return {
    props: evaluated,
    deferred,
    merge: mergeKeys,
    deepMerge: deepMergeKeys,
    matchOn: matchOnKeys,
  };
}
