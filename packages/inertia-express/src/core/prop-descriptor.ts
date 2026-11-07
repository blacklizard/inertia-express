import type { ScrollMetadata } from './types.js';

/**
 * The constructor a {@link PropDescriptor} was created by.
 */
export type PropKind = 'optional' | 'defer' | 'always' | 'merge' | 'once' | 'scroll';

/**
 * A prop's raw source: a plain value or a (possibly async) producer.
 */
export type PropSource<T> = T | (() => T | Promise<T>);

/**
 * Options accepted by the `scroll()` prop constructor.
 */
export interface ScrollOptions<T> {
  /** Key inside the resolved value that holds the scrolled items. Defaults to `'data'`. */
  wrapper?: string;
  /** Pagination metadata, or a function deriving it from the resolved value. */
  metadata: ScrollMetadata | ((resolved: T) => ScrollMetadata);
}

/**
 * A prop wrapped with resolution and merge behaviour, ported from
 * inertia-laravel's prop classes and their `MergesProps`, `DefersProps`
 * and `ResolvesOnce` traits. The descriptor holds the wrapped value by
 * reference and never mutates it.
 */
export default class PropDescriptor<T = unknown> {
  readonly kind: PropKind;

  readonly source: PropSource<T>;

  ignoreFirstLoad = false;

  defers = false;

  group = 'default';

  merges = false;

  deep = false;

  appends = true;

  appendPaths: string[] = [];

  prependPaths: string[] = [];

  matchOnPaths: string[] = [];

  resolvesOnce = false;

  onceKey: string | null = null;

  ttlSeconds: number | null = null;

  expiresAtDate: Date | null = null;

  isFresh = false;

  rescues = false;

  isAlways = false;

  isScroll = false;

  wrapper = 'data';

  scrollMetadata: ScrollMetadata | ((resolved: T) => ScrollMetadata) | null = null;

  private memo: { value: T } | null = null;

  /**
   * Create a descriptor around a prop source.
   *
   * @param kind The constructor that produced this descriptor.
   * @param source The plain value or producer function being wrapped.
   */
  constructor(kind: PropKind, source: PropSource<T>) {
    this.kind = kind;
    this.source = source;
  }

  /**
   * `true` when the prop appends at its root: the append flag is set and no
   * append/prepend paths were recorded.
   */
  get appendsAtRoot(): boolean {
    return this.appends && this.mergesAtRoot();
  }

  /**
   * `true` when the prop prepends at its root: the append flag is cleared and
   * no append/prepend paths were recorded.
   */
  get prependsAtRoot(): boolean {
    return !this.appends && this.mergesAtRoot();
  }

  /**
   * Mark the prop for a shallow client-side merge.
   */
  merge(): this {
    this.merges = true;

    return this;
  }

  /**
   * Mark the prop for a deep client-side merge.
   */
  deepMerge(): this {
    this.deep = true;

    return this.merge();
  }

  /**
   * Configure appending. A boolean sets the root append flag; a string
   * records an append path; a list records each path; a record maps each
   * path to its match-on field.
   *
   * @param path Root flag, path, list of paths, or path-to-matchOn record.
   * @param matchOn Field to dedupe on, recorded as `path.matchOn` when `path` is a string.
   */
  append(path: boolean | string | string[] | Record<string, string> = true, matchOn?: string): this {
    if (typeof path === 'boolean') {
      this.appends = path;
    } else if (typeof path === 'string') {
      this.appendPaths.push(path);
      this.recordMatchOn(path, matchOn);
    } else if (Array.isArray(path)) {
      path.forEach((entry) => this.append(entry));
    } else {
      Object.entries(path).forEach(([key, field]) => this.append(key, field));
    }

    return this;
  }

  /**
   * Configure prepending. A boolean clears (or sets) the root append flag; a
   * string records a prepend path; a list records each path; a record maps
   * each path to its match-on field.
   *
   * @param path Root flag, path, list of paths, or path-to-matchOn record.
   * @param matchOn Field to dedupe on, recorded as `path.matchOn` when `path` is a string.
   */
  prepend(path: boolean | string | string[] | Record<string, string> = true, matchOn?: string): this {
    if (typeof path === 'boolean') {
      this.appends = !path;
    } else if (typeof path === 'string') {
      this.prependPaths.push(path);
      this.recordMatchOn(path, matchOn);
    } else if (Array.isArray(path)) {
      path.forEach((entry) => this.prepend(entry));
    } else {
      Object.entries(path).forEach(([key, field]) => this.prepend(key, field));
    }

    return this;
  }

  /**
   * Replace the match-on paths the client dedupes merged items by.
   *
   * @param path A single path or a list of paths.
   */
  matchOn(path: string | string[]): this {
    this.matchOnPaths = Array.isArray(path) ? [...path] : [path];

    return this;
  }

  /**
   * Defer the prop to a follow-up request.
   *
   * @param group Load group; props sharing a group are fetched together. Defaults to `'default'`.
   */
  defer(group?: string): this {
    this.defers = true;
    this.group = group ?? 'default';

    return this;
  }

  /**
   * Toggle once-resolution, optionally setting its key and expiry.
   *
   * @param value Whether the prop resolves once. Defaults to `true`.
   * @param as Custom once key.
   * @param until TTL in seconds, or an absolute expiry date.
   */
  once(value = true, as?: string, until?: number | Date): this {
    this.resolvesOnce = value;

    if (as !== undefined) {
      this.as(as);
    }

    if (until !== undefined) {
      this.until(until);
    }

    return this;
  }

  /**
   * Set the key the client caches a once-prop under.
   *
   * @param key The once key.
   */
  as(key: string): this {
    this.onceKey = key;

    return this;
  }

  /**
   * Set the once-prop's expiry, replacing any expiry set by an earlier call.
   *
   * @param delay TTL in seconds, or an absolute expiry date.
   */
  until(delay: number | Date): this {
    if (delay instanceof Date) {
      this.expiresAtDate = delay;
      this.ttlSeconds = null;
    } else {
      this.ttlSeconds = delay;
      this.expiresAtDate = null;
    }

    return this;
  }

  /**
   * Force a once-prop to be re-resolved.
   *
   * @param value Whether to refresh. Defaults to `true`.
   */
  fresh(value = true): this {
    this.isFresh = value;

    return this;
  }

  /**
   * Opt into rescuing errors thrown while resolving the prop.
   *
   * @param value Whether to rescue. Defaults to `true`.
   */
  rescue(value = true): this {
    this.rescues = value;

    return this;
  }

  /**
   * The once-prop's expiry as a millisecond epoch, or `null` without a TTL or date.
   *
   * @param now Current time in milliseconds. Defaults to `Date.now()`.
   */
  expiresAt(now: number = Date.now()): number | null {
    if (this.expiresAtDate !== null) {
      return this.expiresAtDate.getTime();
    }

    if (this.ttlSeconds !== null) {
      return now + this.ttlSeconds * 1000;
    }

    return null;
  }

  /**
   * Resolve the source: call it when it is a function, then await the result.
   * A scroll descriptor memoises the first successful result, as
   * `ScrollProp::__invoke` caches `$resolved`: its value is read both for the
   * response and for its pagination metadata, so the source runs only once.
   * Other kinds re-run the source on every call.
   */
  async resolveSource(): Promise<T> {
    if (this.kind === 'scroll' && this.memo !== null) {
      return this.memo.value;
    }

    const value = typeof this.source === 'function'
      ? await (this.source as () => T | Promise<T>)()
      : await this.source;

    if (this.kind === 'scroll') {
      this.memo = { value };
    }

    return value;
  }

  /**
   * Scroll metadata for a resolved value: the configured object, or the
   * configured function applied to `resolved`.
   *
   * @param resolved The resolved prop value.
   */
  metadataFor(resolved: T): ScrollMetadata {
    if (this.scrollMetadata === null) {
      throw new TypeError(`Prop of kind "${this.kind}" has no scroll metadata.`);
    }

    return typeof this.scrollMetadata === 'function' ? this.scrollMetadata(resolved) : this.scrollMetadata;
  }

  /**
   * `true` when no append or prepend paths were recorded.
   */
  private mergesAtRoot(): boolean {
    return this.appendPaths.length === 0 && this.prependPaths.length === 0;
  }

  /**
   * Record `path.matchOn` as a match-on path when `matchOn` is given.
   *
   * @param path The append/prepend path.
   * @param matchOn Field to dedupe on.
   */
  private recordMatchOn(path: string, matchOn: string | undefined): void {
    if (matchOn) {
      this.matchOnPaths.push(`${path}.${matchOn}`);
    }
  }
}
