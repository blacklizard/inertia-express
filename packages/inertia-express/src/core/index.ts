/**
 * Framework-agnostic Inertia.js v3 protocol primitives.
 *
 * Use these to build adapters for any HTTP framework. The `express`
 * subpath wraps these primitives in middleware + a `res.inertia()` helper.
 */

export * from './cache.js';
export * from './dot-props.js';
export * from './errors.js';
export * from './headers.js';
export * from './html.js';
export * from './page.js';
export * from './partial-filter.js';
export { default as PropDescriptor } from './prop-descriptor.js';
export type { PropKind, PropSource, ScrollOptions } from './prop-descriptor.js';
export * from './props.js';
export { default as PropsResolver } from './props-resolver.js';
export * from './props-resolver.js';
export * from './redirects.js';
export * from './render.js';
export type * from './types.js';
export * from './versioning.js';
