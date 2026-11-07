import PropDescriptor from './prop-descriptor.js';

import type { PropSource, ScrollOptions } from './prop-descriptor.js';

/**
 * Prop omitted from the first load and resolved only when requested.
 */
export type OptionalProp<T> = Pick<PropDescriptor<T>, 'once' | 'as' | 'until' | 'fresh'>;

/**
 * Prop resolved in a follow-up request after the first load.
 */
export type DeferProp<T> = Pick<PropDescriptor<T>, 'merge' | 'deepMerge' | 'append' | 'prepend' | 'matchOn' | 'once' | 'as' | 'until' | 'fresh' | 'rescue'>;

/**
 * Prop the client merges into its existing value.
 */
export type MergeProp<T> = Pick<PropDescriptor<T>, 'deepMerge' | 'append' | 'prepend' | 'matchOn' | 'once' | 'as' | 'until' | 'fresh'>;

/**
 * Prop included on every response, regardless of partial filtering.
 */
export type AlwaysProp<T> = Pick<PropDescriptor<T>, never>;

/**
 * Prop the client resolves once and caches across visits.
 */
export type OnceProp<T> = Pick<PropDescriptor<T>, 'as' | 'until' | 'fresh'>;

/**
 * Infinite-scroll prop carrying pagination metadata.
 */
export type ScrollProp<T> = Pick<PropDescriptor<T>, 'defer' | 'matchOn'>;

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
 * A merge prop: the client appends it to its existing value at the root.
 *
 * @param value Plain value or producer.
 */
export function merge<T>(value: PropSource<T>): MergeProp<T> {
  return new PropDescriptor<T>('merge', value).merge();
}

/**
 * A deep-merge prop: the client recursively merges it into its existing value.
 *
 * @param value Plain value or producer.
 */
export function deepMerge<T>(value: PropSource<T>): MergeProp<T> {
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
