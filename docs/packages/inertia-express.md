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
| `lazy(fn)` | Evaluated every visit (full and partial) |
| `optional(fn)` | Only included on partial reloads when requested |
| `defer(fn, group?)` | Excluded from initial visit; auto-fetched after mount |
| `always(fn)` | Included on every response regardless of partial filtering |
| `merge(value, matchOn?)` | Client appends instead of replaces on partial reload |
| `deepMerge(value, matchOn?)` | Client recursively deep-merges instead of shallow-appending |

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
