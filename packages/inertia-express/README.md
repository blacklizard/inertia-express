# @blacklizard/inertia-express

[![CI](https://github.com/blacklizard/inertia-express/actions/workflows/ci.yml/badge.svg)](https://github.com/blacklizard/inertia-express/actions/workflows/ci.yml)
[![Conformance](https://github.com/blacklizard/inertia-express/actions/workflows/conformance.yml/badge.svg)](https://github.com/blacklizard/inertia-express/actions/workflows/conformance.yml)
[![npm version](https://img.shields.io/npm/v/@blacklizard/inertia-express.svg)](https://www.npmjs.com/package/@blacklizard/inertia-express)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >= 24](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)

A production-ready, TypeScript-first server adapter for [Inertia.js](https://inertiajs.com) v3, with first-class support for Express.js.

Inertia.js is a glue layer that lets you build modern, single-page-app-style frontends (Vue, React, Svelte) on top of classic server-side routing and controllers. This package implements the Inertia v3 server protocol for Node.js, mirroring what the official Laravel, Rails, and Phoenix adapters do.

The internal core is framework-agnostic, so future adapters for Fastify, Hono, NestJS, or others can be built on the same primitives.

## Features

- Full implementation of the Inertia.js v3 protocol
- `res.inertia(component, props, options)` Express helper
- Shared props (static or per-request)
- Lazy, optional, deferred, always, merge, and deep-merge props
- Partial reloads (`X-Inertia-Partial-Data` / `X-Inertia-Partial-Except`)
- Asset version handling and automatic 409 + `X-Inertia-Location` on mismatch
- Inertia-aware redirects (auto 303 after PUT/PATCH/DELETE)
- External redirects via `res.inertiaLocation()`
- Validation error helpers
- Pluggable root view
- Pluggable SSR hook + production-grade out-of-process SSR client (timeout / retry / circuit breaker)
- View cache with pluggable store (memory built-in, Redis via `@blacklizard/inertia-cache-redis`)
- CDN edge-cache policy (`Cache-Control` / `Vary` for non-Inertia responses)
- Vite manifest → version helper (auto-invalidates SSR cache on deploy)
- Prerender CLI + programmatic API (warmup or static export)
- TypeScript-first API with declaration merging on `express`
- ESM-only, Node.js 20+

## Installation

```bash
pnpm add @blacklizard/inertia-express
# or
npm install @blacklizard/inertia-express
```

`express` is a peer dependency:

```bash
pnpm add express
```

## Quick start

```ts
import express from "express";
import { inertia } from "@blacklizard/inertia-express";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  inertia({
    version: () => process.env.ASSET_VERSION ?? null,
    sharedProps: (req) => ({
      auth: { user: req.user ?? null },
      flash: req.session?.flash ?? {},
    }),
  }),
);

app.get("/users", async (req, res) => {
  await res.inertia("Users/Index", {
    users: await db.users.findMany(),
  });
});

app.listen(3000);
```

## Configuration

Pass options to `inertia({ ... })`:

| Option             | Type                                  | Description                                                                  |
| ------------------ | ------------------------------------- | ---------------------------------------------------------------------------- |
| `version`          | `string \| (req) => string \| null`   | Asset version. Triggers a forced reload on mismatch.                         |
| `sharedProps`      | `object \| (req) => object`           | Props merged into every page response.                                       |
| `rootView`         | `({ page, req, res }) => string`      | Custom HTML shell for non-Inertia (first-load) responses.                    |
| `ssr`              | `SsrRenderer`                         | SSR hook returning `{ head, body }`. See [SSR](#server-side-rendering-ssr).  |
| `cache`            | `InertiaCacheOptions`                 | View cache for SSR HTML. See [View cache](#view-cache).                      |
| `edgeCache`        | `EdgeCachePolicy`                     | CDN `Cache-Control` policy. See [Edge caching](#edge-caching-cdn).           |
| `flashFromSession` | `boolean`                             | Auto-promote `req.session.errors` / `flash` into shared props. Default off.  |

If no `rootView` is given, the middleware emits a minimal default HTML shell with an empty `<div id="app">` plus the v3 `<script type="application/json" data-page="app">` page tag, so you can wire up a Vite client manually.

## Rendering pages

Inside any handler:

```ts
app.get("/dashboard", async (req, res) => {
  await res.inertia("Dashboard", {
    stats: await dashboard.getStats(),
  });
});
```

The middleware automatically:

- Detects `X-Inertia: true` and returns the page object as JSON.
- Otherwise renders the configured root view with the page object embedded.
- Applies version mismatch detection on Inertia GETs.
- Filters props for partial reloads.

## Shared props

Shared props are evaluated on every render and merged into the page's props. Per-page props win on key collisions.

```ts
inertia({
  sharedProps: async (req) => ({
    auth: { user: req.user ?? null },
    csrf: req.csrfToken?.(),
    flash: req.session?.flash ?? {},
    errors: req.session?.errors ?? {},
  }),
});
```

## Lazy, optional, deferred, always, and merge props

```ts
import { lazy, optional, defer, always, merge, deepMerge } from "@blacklizard/inertia-express";

await res.inertia("Dashboard", {
  // Always evaluated.
  user: req.user,

  // Evaluated on every visit, but the function form lets you defer the work.
  recent: lazy(() => userService.recent()),

  // Omitted on full visits; only sent if requested via partial reload.
  heavy: optional(() => analytics.expensiveQuery()),

  // Omitted on initial visit; the client automatically requests it via a
  // follow-up partial reload after mount, grouped by `"dashboard"`.
  stats: defer(() => dashboard.getStats(), "dashboard"),

  // Included on every response, even partial reloads that filter it out.
  flash: always(() => req.session.flash),

  // Merge with the existing client-side prop on partial reloads instead of
  // replacing it. Useful for paginated lists / infinite-scroll feeds. Pass a
  // match-on field to dedupe array items instead of blindly appending.
  notifications: merge(await db.notifications.page(req.query.page), "id"),

  // Recursive deep-merge into the existing client-side prop.
  filters: deepMerge({ sort: { field: "name" } }),
});
```

A client can send `X-Inertia-Reset: <key>` to have a merge / deep-merge prop
replaced instead of merged on that visit.

## Partial reloads

When the client requests a partial reload, it sends:

- `X-Inertia-Partial-Component`: the component currently mounted.
- `X-Inertia-Partial-Data`: comma-separated prop keys to include.
- `X-Inertia-Partial-Except`: comma-separated prop keys to exclude (takes precedence over `Partial-Data`).

The middleware applies this filtering automatically. Partial reload filtering is only applied when `X-Inertia-Partial-Component` matches the rendered component, so cross-page navigations don't accidentally drop props.

## Validation errors

The simplest pattern is to share `req.session.errors` from `sharedProps`:

```ts
inertia({
  sharedProps: (req) => ({ errors: req.session?.errors ?? {} }),
});
```

The middleware also exposes `res.inertiaErrors(errors, bag?)`, which:

- Writes errors to `req.session.errors` if a session is present.
- Otherwise stores them on `res.locals.inertiaErrors` for the same response.

```ts
app.post("/users", (req, res) => {
  const errors = validate(req.body);
  if (Object.keys(errors).length) {
    res.inertiaErrors(errors);
    return res.redirect("/users/new");
  }
  // ...success path
});
```

You may pass an error bag name to namespace errors under `errors[bag]`.

## Redirects

For Inertia requests, `res.redirect(url)` after a `PUT`, `PATCH`, or `DELETE` is automatically promoted to status `303`. This is required by the Inertia protocol to ensure the follow-up request is a `GET`.

For external redirects (different host or full reload), use `res.inertiaLocation()`:

```ts
res.inertiaLocation("https://billing.example.com/checkout");
```

For Inertia (XHR) visits this returns `409 X-Inertia-Location: <url>` which the client handles by performing `window.location = url`. For plain browser visits it falls back to `302 Location: <url>`.

## Asset versioning

Pass a `version` resolver. When a client's `X-Inertia-Version` header doesn't match the current value on a `GET`, the middleware responds with `409` + `X-Inertia-Location: <same-url>`, and the Inertia client performs a full reload.

```ts
inertia({
  version: () => readFileSync("public/build/manifest.json", "utf8"),
});
```

A version of `null` (the default) disables mismatch detection.

## Custom root view

Use any template engine, JSX, or string template you like:

```ts
inertia({
  rootView: ({ page }) => myPugTemplate({ page }),
});
```

Inside the root view, embed the page object in the Inertia v3 `<script type="application/json" data-page="app">` tag. The helper `encodePageScript(page)` encodes the JSON safely for you:

```ts
import { encodePageScript } from "@blacklizard/inertia-express";

inertia({
  rootView: ({ page }) => `
    <!doctype html>
    <html>
      <body>
        <div id="app"></div>
        <script data-page="app" type="application/json">${encodePageScript(page)}</script>
        <script type="module" src="/build/app.js"></script>
      </body>
    </html>
  `,
});
```

## Server-side rendering (SSR)

Pass an `ssr` hook to render pages on the server before the first byte goes to the browser. The hook returns `{ head, body }` (string or string[] for `head`); the middleware injects it into the default root view, or exposes it as `res.locals.ssr` for a custom `rootView` to use.

```ts
inertia({
  ssr: async ({ page }) => {
    const { default: render } = await import("./dist/ssr/entry-server.js");
    return render(page);
  },
});
```

Returning `null` from the hook skips SSR for that request (useful for client-only fallback when SSR is unavailable).

### Out-of-process SSR via `createInertiaSsrFetcher`

For production, run SSR in a separate process pool (e.g. `@blacklizard/inertia-ssr-worker`) and use `createInertiaSsrFetcher` to call it over HTTP:

```ts
import { inertia, createInertiaSsrFetcher } from "@blacklizard/inertia-express";

inertia({
  ssr: createInertiaSsrFetcher({
    url: "http://ssr.internal/render",
    timeoutMs: 5000,
    retries: 2,
    breakerThreshold: 5,
    breakerCooldownMs: 30_000,
    fallback: "client",
  }),
});
```

| Option              | Default | Description                                                            |
| ------------------- | ------- | ---------------------------------------------------------------------- |
| `url`               | —       | SSR endpoint URL (POSTs the page object as JSON).                      |
| `timeoutMs`         | `5000`  | Per-attempt timeout.                                                   |
| `retries`           | `2`     | Retries on failure (up to 3 total tries). Exponential backoff.         |
| `retryBaseMs`       | `100`   | Initial backoff, doubles per retry.                                    |
| `breakerThreshold`  | `5`     | Open circuit after N consecutive failures. `0`/`Infinity` disables.    |
| `breakerCooldownMs` | `30000` | How long the breaker stays open before allowing one probe.             |
| `fallback`          | `"client"` | `"client"` returns empty SSR (client renders); `"throw"` rethrows.   |
| `headers`           | —       | Extra headers per request.                                             |

The wire protocol matches `@inertiajs/{vue3,react,svelte}/server` `createServer()`: `POST /` with the page object as JSON, response `{ head: string[], body: string }`.

## View cache

Layer a cache between the request and the SSR call so cached HTML can be served without invoking the renderer. The cache key incorporates the page component, props, URL, and `version`, so deploys atomically retire all entries.

```ts
import { inertia, createMemoryCacheStore } from "@blacklizard/inertia-express";

inertia({
  cache: {
    store: createMemoryCacheStore({ max: 500 }),
    ttlSeconds: 300,
    keyPrefix: "inertia:ssr",
    vary: ({ req }) => !req.session?.user, // skip auth'd traffic
    discriminator: (req) => req.headers["accept-language"]?.toString(),
    onError: (op, err) => log.warn({ op, err }, "ssr cache error"),
  },
});
```

| Option          | Default        | Description                                                                  |
| --------------- | -------------- | ---------------------------------------------------------------------------- |
| `store`         | —              | `SsrCacheStore` impl. See `createMemoryCacheStore` or `inertia-cache-redis`. |
| `ttlSeconds`    | `300`          | Entry TTL.                                                                   |
| `keyPrefix`     | `"inertia:ssr"` | Namespace for keys.                                                         |
| `vary`          | GET + 200 + non-Inertia | Per-request bypass — return `false` to skip read+write.              |
| `discriminator` | —              | Extra cache-key segment (locale, A/B bucket, theme).                         |
| `onError`       | —              | Called on `get`/`set`/`delete` failures. Cache failures are non-fatal.       |

For multi-process deployments, use the Redis store:

```bash
pnpm add @blacklizard/inertia-cache-redis
```

```ts
import { createRedisCacheStore } from "@blacklizard/inertia-cache-redis";

inertia({
  cache: { store: createRedisCacheStore({ client: redis, keyPrefix: "inertia:ssr" }) },
});
```

You can also stack `createMemoryCacheStore` as L1 in front of Redis L2 (see `inertia-cache-redis` README).

## Asset versioning from a Vite manifest

`viteManifestVersion` reads `manifest.json` and returns a hash that changes whenever any built asset changes. Pair it with the `version` option so deploys force clients to reload AND atomically retire SSR cache entries.

```ts
import { viteManifestVersion } from "@blacklizard/inertia-express";

inertia({
  version: viteManifestVersion({
    manifestPath: "public/build/.vite/manifest.json",
    watchMtime: true,
  }),
});
```

`watchMtime: false` reads once on boot — slightly faster but requires a process restart to pick up new builds.

## Prerender / static export

Two output modes (combinable):

- **`warmup`** — fetches each route, discards the body. Populates the SSR view cache after a deploy so the first real visitor doesn't pay the SSR latency cost.
- **`static`** — fetches each route, writes the response body to `<outDir>/<route>/index.html`. Serve those files directly via nginx/CDN, bypassing Express.

CLI (installed via `bin`):

```bash
inertia-prerender \
  --base-url http://127.0.0.1:3000 \
  --route / --route /about --route /pricing \
  --mode both --out-dir dist/static \
  --concurrency 8 --timeout-ms 30000 \
  --header 'X-Prerender: 1' \
  --fail-on-error
```

`--routes <file.json>` reads an array of routes from JSON. `--quiet` suppresses per-route lines.

Programmatic:

```ts
import { prerender } from "@blacklizard/inertia-express";

const summary = await prerender({
  baseUrl: "http://127.0.0.1:3000",
  routes: ["/", "/about", "/pricing"],
  mode: "warmup",
  concurrency: 8,
});

console.log(`${summary.ok}/${summary.total} ok, ${summary.failed} failed`);
```

Failures on individual routes never halt the run — inspect `summary.results` to fail-loud in CI.

## Flash from session

Set `flashFromSession: true` to auto-promote `req.session.errors` and `req.session.flash` into shared props (and clear them after read), so you don't have to wire them into `sharedProps` manually:

```ts
inertia({ flashFromSession: true });
```

Off by default — most apps already wire flash/errors via `sharedProps`. Requires a session middleware that exposes `req.session`.

## Edge caching (CDN)

Pass an `edgeCache` policy to apply `Cache-Control` headers to non-Inertia (first-load HTML) responses. The middleware always emits `Vary: Accept, X-Inertia` so a CDN can safely cache the HTML shell without ever serving it to an Inertia (XHR) request.

The policy receives `{ req, res, page }` and returns a decision object — or `null` to opt out for that request:

```ts
inertia({
  edgeCache: ({ req, page }) => {
    // Authed traffic: never cache.
    if (req.session?.user) return null;

    // Marketing Pages: cache aggressively.
    if (page.component.startsWith("Marketing/")) {
      return { sMaxAge: 3600, maxAge: 0, staleWhileRevalidate: 86400 };
    }

    // Everything else: short edge cache, browser revalidates.
    return { sMaxAge: 60, maxAge: 0, staleWhileRevalidate: 30 };
  },
});
```

The decision shape:

| Field                  | Type       | Description                                                          |
| ---------------------- | ---------- | -------------------------------------------------------------------- |
| `sMaxAge`              | `number`   | `s-maxage` for shared/CDN caches, in seconds. `<= 0` opts out.       |
| `maxAge`               | `number?`  | Browser `max-age`. Defaults to `0` (revalidate immediately).         |
| `staleWhileRevalidate` | `number?`  | `stale-while-revalidate` window in seconds.                          |
| `vary`                 | `string[]?`| Extra `Vary` values appended to the default `Accept, X-Inertia`.     |

The middleware skips header application when:

- The request is an Inertia (XHR) visit — those vary per session.
- The policy returns `null` or `sMaxAge <= 0`.
- The response is not 2xx.

For varying caches by cookie or locale, append to `vary`:

```ts
edgeCache: () => ({
  sMaxAge: 60,
  vary: ["Cookie", "Accept-Language"],
});
```

Common pattern — pair with the in-process `cache` view cache so the SSR renderer is skipped entirely on cache hits, then let the CDN absorb the rest:

```ts
inertia({
  cache: { ttlMs: 60_000 },
  edgeCache: ({ req }) =>
    req.session?.user ? null : { sMaxAge: 60, staleWhileRevalidate: 300 },
});
```

If you need to apply a decision from a custom code path (e.g. a non-Inertia route that you still want to share the same caching rules), `applyEdgeCache` is exported:

```ts
import { applyEdgeCache } from "@blacklizard/inertia-express";

applyEdgeCache({ sMaxAge: 60, staleWhileRevalidate: 300 }, res);
```

### Invalidation

Edge caches are time-based. To invalidate on deploy, change `version` — the Inertia client treats this as a version mismatch and forces a full reload, but the CDN cache itself ages out via `s-maxage`. For instant invalidation, use your CDN's purge API (Cloudflare `purge_cache`, Fastly `purge`, CloudFront invalidation) keyed on the URL or a surrogate tag.

## Subpath imports

The framework-agnostic core (no Express dependency) is exported separately:

```ts
import {
  buildPage,
  parseInertiaRequest,
  resolveProps,
} from "@blacklizard/inertia-express/core";
```

Use this to build adapters for other frameworks.

## TypeScript

The package augments Express types so `req.inertia`, `res.inertia()`, `res.inertiaLocation()`, and `res.inertiaErrors()` are typed without extra setup, as long as `@blacklizard/inertia-express` is imported somewhere in your project.

For typed page props on the client side, generic `res.inertia<TProps>("Component", props)` is supported.

## Compatibility

- Inertia.js v3 protocol
- Node.js >= 24
- Express 4 or 5 (peer dep; tested against Express 5)
- ESM-only

## Known limitations

- The default HTML shell is intentionally minimal. Real apps should provide a `rootView`.
- This adapter does not bundle a session implementation — bring your own (`express-session`, `cookie-session`, etc.).
- Optimistic-update / `useHttp` server-side helpers are intentionally minimal here; the protocol primitives (`mergeProps`, `deepMergeProps`, `matchPropsOn`, `deferredProps`, `clearHistory`, `encryptHistory`) are exposed.

## License

MIT
