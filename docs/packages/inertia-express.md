# @blacklizard/inertia-express

The main package. Implements the Inertia.js v3 server protocol for Express.

## Install

```bash
pnpm add @blacklizard/inertia-express express
```

## Package exports

| Path | Description |
|------|-------------|
| `@blacklizard/inertia-express` | Express adapter (middleware, helpers, types) |
| `@blacklizard/inertia-express/core` | Framework-agnostic core (no Express dependency) |

## Main export API

### Middleware

| Export | Description |
|--------|-------------|
| `inertia(options?)` | Creates the Express middleware |

### SSR

| Export | Description |
|--------|-------------|
| `createInertiaSsrFetcher(options)` | HTTP SSR client with circuit breaker and retries |

### Cache

| Export | Description |
|--------|-------------|
| `createMemoryCacheStore(options?)` | LRU in-process cache store |

### Props helpers

| Export | Description |
|--------|-------------|
| `optional(fn)` | Only included on partial reloads when requested |
| `defer(fn, group?)` | Excluded from initial visit; auto-fetched after mount. Chains `.merge()`, `.deepMerge()`, `.rescue()`, `.once()` |
| `always(value)` | Included on every response regardless of partial filtering |
| `merge(value)` | Client appends instead of replaces; chain `.append()`, `.prepend()`, `.matchOn()` for nested paths and dedupe |
| `deepMerge(value)` | Client recursively deep-merges instead of appending |
| `once(fn)` | Resolved once and cached by the client across visits; chain `.as()`, `.until()`, `.fresh()` |
| `scroll(fn, { metadata, wrapper? })` | Infinite-scroll prop merged at its wrapper key, with pagination metadata |
| `isPropDescriptor(value)` | Type guard for descriptors built by the helpers above |

A bare closure (`() => value`) is evaluated on each response that includes it and needs no helper. See [Props](/core/props).

### Versioning

| Export | Description |
|--------|-------------|
| `viteManifestVersion(options)` | Reads Vite manifest and returns a stable hash |

### Prerendering

| Export | Description |
|--------|-------------|
| `prerender(options)` | Programmatic cache warmup or static export |

### Utilities

| Export | Description |
|--------|-------------|
| `encodePageScript(page)` | Encode page JSON for the v3 `<script data-page>` tag |
| `applyEdgeCache(decision, res)` | Apply CDN cache headers to a response |
| `canonicalStringify(obj)` | Deterministic JSON stringify (used in cache key computation) |
| `computeSsrCacheKey(input)` | Compute an SSR cache key from prefix + version + component + props (+ optional discriminator) |

### Headers

| Export | Description |
|--------|-------------|
| `INERTIA_HEADERS` | Object with all Inertia header name constants |
| `INERTIA_REDIRECT_STATUS` | `303` — status for Inertia redirects |
| `INERTIA_LOCATION_STATUS` | `409` — status for external redirects |

## Core subpath export

The framework-agnostic core is available separately for building adapters:

```ts
import {
  buildPage,
  parseInertiaRequest,
  resolveProps,
  createPage,
  computeSsrCacheKey,
  canonicalStringify,
} from "@blacklizard/inertia-express/core";
```

## TypeScript augmentation

The package augments `express-serve-static-core` types:

```ts
// on Request:
req.inertia?: InertiaRequestInfo

// on Response:
res.inertia(component, props?, options?): Promise<void>
res.inertiaLocation(url: string): void
res.inertiaErrors(errors: ValidationErrors, bag?: string): void
```

These are typed automatically as long as `@blacklizard/inertia-express` is imported somewhere in your project.

## CLI

The package ships an `inertia-prerender` binary for cache warmup and static export:

```bash
npx inertia-prerender --base-url http://localhost:3000 --route / --mode warmup
```

See [Prerendering](/advanced/prerendering) for full documentation.
