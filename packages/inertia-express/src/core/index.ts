/**
 * Framework-agnostic Inertia.js v3 protocol primitives.
 *
 * Use these to build adapters for any HTTP framework. The `express`
 * subpath wraps these primitives in middleware + a `res.inertia()` helper.
 */

export * from './cache.js';
export * from './errors.js';
export * from './headers.js';
export * from './html.js';
export * from './page.js';
export * from './props.js';
export * from './redirects.js';
export * from './render.js';
export type * from './types.js';
export * from './versioning.js';
