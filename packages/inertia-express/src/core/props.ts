import PropDescriptor from './prop-descriptor.js';

import type { LiveOptions, PropSource, ScrollOptions } from './prop-descriptor.js';

/**
 * Argument accepted by `append()` / `prepend()`: a root flag, a path, a list
 * of paths, or a path-to-matchOn record.
 */
type MergePath = boolean | string | string[] | Record<string, string>;

/**
 * Prop omitted from the first load and resolved only when requested.
 */
export interface OptionalProp<T> {
  once: (value?: boolean, as?: string, until?: number | Date) => OptionalProp<T>;
  as: (key: string) => OptionalProp<T>;
  until: (delay: number | Date) => OptionalProp<T>;
  fresh: (value?: boolean) => OptionalProp<T>;
  live: (options: LiveOptions) => OptionalProp<T>;
}

/**
 * Prop resolved in a follow-up request after the first load.
 */
export interface DeferProp<T> {
  merge: () => DeferProp<T>;
  deepMerge: () => DeferProp<T>;
  append: (path?: MergePath, matchOn?: string) => DeferProp<T>;
  prepend: (path?: MergePath, matchOn?: string) => DeferProp<T>;
  matchOn: (path: string | string[]) => DeferProp<T>;
  once: (value?: boolean, as?: string, until?: number | Date) => DeferProp<T>;
  as: (key: string) => DeferProp<T>;
  until: (delay: number | Date) => DeferProp<T>;
  fresh: (value?: boolean) => DeferProp<T>;
  rescue: (value?: boolean) => DeferProp<T>;
  live: (options: LiveOptions) => DeferProp<T>;
}

/**
 * Prop the client merges into its existing value.
 */
export interface MergeProp<T> {
  deepMerge: () => MergeProp<T>;
  append: (path?: MergePath, matchOn?: string) => MergeProp<T>;
  prepend: (path?: MergePath, matchOn?: string) => MergeProp<T>;
  matchOn: (path: string | string[]) => MergeProp<T>;
  once: (value?: boolean, as?: string, until?: number | Date) => MergeProp<T>;
  as: (key: string) => MergeProp<T>;
  until: (delay: number | Date) => MergeProp<T>;
  fresh: (value?: boolean) => MergeProp<T>;
}

/**
 * Prop included on every response, regardless of partial filtering. Its only
 * chain method declares live updates.
 */
export interface AlwaysProp<T> {
  live: (options: LiveOptions) => AlwaysProp<T>;
}

/**
 * Prop the client refreshes when a realtime event arrives.
 */
export interface LiveProp<T> {
  live: (options: LiveOptions) => LiveProp<T>;
}

/**
 * Prop the client resolves once and caches across visits.
 */
export interface OnceProp<T> {
  as: (key: string) => OnceProp<T>;
  until: (delay: number | Date) => OnceProp<T>;
  fresh: (value?: boolean) => OnceProp<T>;
  live: (options: LiveOptions) => OnceProp<T>;
}

/**
 * Infinite-scroll prop carrying pagination metadata.
 */
export interface ScrollProp<T> {
  defer: (group?: string) => ScrollProp<T>;
  matchOn: (path: string | string[]) => ScrollProp<T>;
}

/**
 * Throw a `TypeError` unless `fn` is callable.
 *
 * @param name Constructor name, for the error message.
 * @param fn Value that must be a function.
 */
function assertCallable(name: string, fn: unknown): void {
  if (typeof fn !== 'function') {
    throw new TypeError(`${name}() expects a function, received ${typeof fn}.`);
  }
}

/**
 * Throw a `TypeError` when a merge constructor received extra arguments
 * (the 2.x `merge(value, matchOn)` form), so migrating callers fail loudly
 * instead of silently losing their dedupe key.
 *
 * @param name Constructor name, for the error message.
 * @param extra Arguments passed after the value.
 */
function assertNoMatchOnArgument(name: string, extra: readonly unknown[]): void {
  if (extra.length > 0) {
    throw new TypeError(`${name}() takes a single argument; use ${name}(value).matchOn(...) to dedupe merged items.`);
  }
}

/**
 * An optional prop: omitted from the first load, resolved when requested.
 *
 * @param fn Producer called (and awaited) when the prop is requested.
 */
export function optional<T>(fn: () => T | Promise<T>): OptionalProp<T> {
  assertCallable('optional', fn);
  const prop = new PropDescriptor<T>('optional', fn);
  prop.ignoreFirstLoad = true;

  return prop;
}

/**
 * A deferred prop: omitted from the first load and fetched by the client in
 * a follow-up request with the rest of its group.
 *
 * @param fn Producer called (and awaited) on the follow-up request.
 * @param group Load group; props sharing a group are fetched together.
 */
export function defer<T>(fn: () => T | Promise<T>, group = 'default'): DeferProp<T> {
  assertCallable('defer', fn);
  const prop = new PropDescriptor<T>('defer', fn);
  prop.ignoreFirstLoad = true;

  return prop.defer(group);
}

/**
 * An always prop: included on every response, even partial reloads that do
 * not request it.
 *
 * @param value Plain value or producer.
 */
export function always<T>(value: PropSource<T>): AlwaysProp<T> {
  const prop = new PropDescriptor<T>('always', value);
  prop.isAlways = true;

  return prop;
}

/**
 * A live prop: its value is resolved like an always prop's source and the
 * client refreshes it when one of the given events arrives.
 *
 * @param value Plain value or producer.
 * @param options Events, channels and optional throttle.
 */
export function live<T>(value: PropSource<T>, options: LiveOptions): LiveProp<T> {
  return new PropDescriptor<T>('live', value).live(options);
}

/**
 * A merge prop: the client appends it to its existing value at the root.
 * Throws a `TypeError` when given a second argument (the 2.x `matchOn`
 * form); chain `.matchOn()` instead.
 *
 * @param value Plain value or producer.
 * @param extra Rejected; present only to catch the 2.x call form.
 */
export function merge<T>(value: PropSource<T>, ...extra: never[]): MergeProp<T> {
  assertNoMatchOnArgument('merge', extra);

  return new PropDescriptor<T>('merge', value).merge();
}

/**
 * A deep-merge prop: the client recursively merges it into its existing value.
 * Throws a `TypeError` when given a second argument (the 2.x `matchOn`
 * form); chain `.matchOn()` instead.
 *
 * @param value Plain value or producer.
 * @param extra Rejected; present only to catch the 2.x call form.
 */
export function deepMerge<T>(value: PropSource<T>, ...extra: never[]): MergeProp<T> {
  assertNoMatchOnArgument('deepMerge', extra);

  return new PropDescriptor<T>('merge', value).deepMerge();
}

/**
 * A once prop: resolved once and cached by the client across visits.
 *
 * @param fn Producer called (and awaited) when the client lacks the value.
 */
export function once<T>(fn: () => T | Promise<T>): OnceProp<T> {
  assertCallable('once', fn);

  return new PropDescriptor<T>('once', fn).once();
}

/**
 * An infinite-scroll prop: merged at its wrapper key and carrying
 * pagination metadata.
 *
 * @param fn Producer called (and awaited) for each page.
 * @param options Wrapper key (default `'data'`) and pagination metadata.
 */
export function scroll<T>(fn: () => T | Promise<T>, options: ScrollOptions<T>): ScrollProp<T> {
  assertCallable('scroll', fn);

  if (options?.metadata === undefined || options.metadata === null) {
    throw new TypeError('scroll() requires options.metadata.');
  }

  const prop = new PropDescriptor<T>('scroll', fn).merge();
  prop.isScroll = true;
  prop.wrapper = options.wrapper ?? 'data';
  prop.scrollMetadata = options.metadata;

  return prop;
}

/**
 * Type guard: `true` when `value` is a {@link PropDescriptor}.
 *
 * @param value Value to test.
 */
export function isPropDescriptor(value: unknown): value is PropDescriptor {
  return value instanceof PropDescriptor;
}
