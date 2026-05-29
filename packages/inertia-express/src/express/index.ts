/**
 * Express adapter for Inertia.js v3.
 *
 * Default entry point of `@blacklizard/inertia-express`. The framework-agnostic
 * core is available at `@blacklizard/inertia-express/core`.
 */

import { inertia } from './middleware.js';

export type {
  AlwaysProp,
  ComputeCacheKeyInput,
  DeepMergeProp,
  DeferredProp,
  InertiaPage,
  InertiaRequestInfo,
  LazyProp,
  MergeProp,
  OptionalProp,
  PageProps,
  SharedPropsInput,
  SsrCacheEntry,
  SsrCacheStore,
  ValidationErrors,
  VersionResolver,
} from '../core/index.js';
// Re-export the most commonly used core helpers so users only need a single
// import path for typical apps.
export {
  always,
  canonicalStringify,
  computeSsrCacheKey,
  deepMerge,
  defer,
  INERTIA_HEADERS,
  INERTIA_LOCATION_STATUS,
  INERTIA_REDIRECT_STATUS,
  lazy,
  merge,
  optional,
} from '../core/index.js';
export type { EdgeCacheDecision, EdgeCachePolicy } from './edge-cache.js';
export { applyEdgeCache } from './edge-cache.js';
export type { MemoryCacheStoreOptions } from './memory-store.js';
export { createMemoryCacheStore } from './memory-store.js';
export { inertia };
export default inertia;
export type {
  PrerenderOptions,
  PrerenderRouteResult,
  PrerenderSummary,
} from './prerender.js';
export { prerender } from './prerender.js';
export {
  encodePageScript,
  sendInertiaLocation,
  sendInertiaResponse,
  sendVersionMismatch,
} from './response.js';
export type { InertiaSsrFetcherOptions } from './ssr-fetcher.js';
export { createInertiaSsrFetcher } from './ssr-fetcher.js';
export type {
  InertiaCacheOptions,
  InertiaMiddlewareOptions,
  InertiaResponseOptions,
  RootViewInput,
  RootViewRenderer,
  SsrRenderer,
  SsrRendererInput,
  SsrResult,
} from './types.js';
export type {
  ViteManifestAssets,
  ViteManifestAssetsOptions,
  ViteManifestVersionOptions,
} from './vite-manifest.js';
export { viteManifestAssets, viteManifestVersion } from './vite-manifest.js';
