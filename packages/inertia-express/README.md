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
- Optional, deferred (with rescue), always, merge, deep-merge, once, and infinite-scroll props
- Partial reloads (`X-Inertia-Partial-Data` / `X-Inertia-Partial-Except`)
- Asset version handling and automatic 409 + `X-Inertia-Location` on mismatch
- Inertia-aware redirects (auto 303 after PUT/PATCH/DELETE/QUERY, 409 + `X-Inertia-Redirect` for `#fragment` targets, empty 200 → redirect back)
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
| `flashFromSession` | `boolean`                             | Surface `req.session.flash` as the top-level `flash` page key. Default off.  |

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
  }),
});
```

Validation errors do not need wiring here: `errors` is shared on every page automatically (see [Validation errors](#validation-errors)).

## Prop helpers

Every prop value is either a plain value, a bare closure (evaluated on each
response that includes it, awaited if it returns a promise), or a descriptor
built by one of the constructors below. Descriptors are chainable and mirror
inertia-laravel's prop classes; the resolver is a port of its `PropsResolver`.

```ts
import { always, deepMerge, defer, merge, once, optional, scroll } from "@blacklizard/inertia-express";
```

A bare closure replaces 2.x's `lazy()`:

```ts
app.get("/dashboard", async (req, res) => {
  await res.inertia("Dashboard", {
    user: req.user,
    recent: () => userService.recent(),
  });
});
```

### `optional`

Omitted from the first load; resolved only when a partial reload asks for it.

```ts
app.get("/reports", async (req, res) => {
  await res.inertia("Reports", {
    heavy: optional(() => analytics.expensiveQuery()),
  });
});
```

Laravel: `Inertia::optional()`

### `defer`

Omitted from the first load; the client fetches it in a follow-up request with
the rest of its group (default `"default"`). `.rescue()` opts in to error
rescue: if the producer throws, the prop is dropped from the response, its path
is reported in `rescuedProps`, and the middleware's `onRescue` hook is called.

```ts
app.get("/dashboard", async (req, res) => {
  await res.inertia("Dashboard", {
    stats: defer(() => dashboard.getStats(), "dashboard"),
    feed: defer(() => feedService.load()).rescue(),
  });
});
```

Laravel: `Inertia::defer()`

### `always`

Included on every response, even partial reloads that do not request it.
Takes a plain value or a closure.

```ts
app.get("/inbox", async (req, res) => {
  await res.inertia("Inbox", {
    flash: always(() => req.session.flash),
  });
});
```

Laravel: `Inertia::always()`

### `merge` / `deepMerge`

`merge(value)` tells the client to append the prop to its existing value at the
root; `deepMerge(value)` merges recursively. Chain `.append(path?, matchOn?)`
or `.prepend(path?, matchOn?)` to target nested paths, and `.matchOn(path)` to
dedupe items by a key instead of blindly appending. A path argument may be
`true` (the root, the default), a dotted path string, a list of paths, or a
`{ path: matchOnKey }` record. A client can send `X-Inertia-Reset: <key>` to
have a merge prop replaced instead of merged on that visit.

```ts
app.get("/notifications", async (req, res) => {
  await res.inertia("Notifications", {
    notifications: merge(() => db.notifications.page(req.query.page)).matchOn("id"),
    feed: merge(() => feedService.page(req.query.page)).append("data", "id").prepend("pinned"),
    filters: deepMerge({ sort: { field: "name" } }),
  });
});
```

Laravel: `Inertia::merge()` / `Inertia::deepMerge()`

### `once`

Resolved once and cached by the client across visits; later visits skip the
producer while the client still holds the value. `.as(key)` sets a custom cache
key (shareable across pages), `.until(delay)` sets an expiry (a number of
seconds, or a `Date`), and `.fresh()` forces re-resolution on this response.
`optional`, `defer` and `merge` descriptors also accept `.once()`.

```ts
app.get("/settings", async (req, res) => {
  await res.inertia("Settings", {
    countries: once(() => geo.countries()).as("countries").until(3600),
    plans: once(() => billing.plans()).until(new Date("2027-01-01")),
    banner: once(() => cms.banner()).fresh(req.query.refresh === "1"),
  });
});
```

Laravel: `Inertia::once()`

### `scroll`

An infinite-scroll prop: merged at its `wrapper` key (default `"data"`) and
emitted with pagination metadata. `metadata` is required — either an object
`{ pageName, previousPage, nextPage, currentPage }` or a function deriving it
from the resolved value. The merge direction follows the client's
`X-Inertia-Infinite-Scroll-Merge-Intent` header (`prepend`, otherwise
`append`). Chain `.defer(group?)` to load the first page in a follow-up
request, and `.matchOn(path)` to dedupe.

```ts
app.get("/posts", async (req, res) => {
  await res.inertia("Posts", {
    posts: scroll(() => postService.paginate(req.query.page), {
      metadata: (page) => ({ pageName: "page", previousPage: page.prev, nextPage: page.next, currentPage: page.current }),
    }).matchOn("id"),
    comments: scroll(() => commentService.page(1), { wrapper: "items", metadata: { pageName: "page", previousPage: null, nextPage: 2, currentPage: 1 } }).defer(),
  });
});
```

Laravel: `Inertia::scroll()`

### Rescue hook and fragment preservation

Pass `onRescue: (error, path, req) => …` to `inertia({ … })` to report errors
from rescued deferred props (the default logs them). Pass
`{ preserveFragment: true }` as the third argument to `res.inertia()` to have
the client keep the current URL `#fragment` across that visit.

### Migrating from 2.x

| 2.x | 3.0 |
|---|---|
| `lazy(fn)` | `fn` (a bare closure) |
| `merge(value, matchOn)` | `merge(value).matchOn(matchOn)` |
| `deepMerge(value, matchOn)` | `deepMerge(value).matchOn(matchOn)` |
| `defer(fn, group)` | unchanged |
| `optional(fn)`, `always(fn)` | unchanged |
| `resolveProps()` → `{ props, deferred, merge, deepMerge, matchOn }` | `{ props, metadata }` |
| Types `MergeProp<T> = T & {...}` | descriptor types; the page `props` type is unchanged |

Other changes to check when upgrading:

- `merge(value, "id")` and `deepMerge(value, "id")` now throw a `TypeError` instead of silently ignoring the second argument. Use `.matchOn("id")`.
- Partial reloads follow dotted paths. `only: users.data` on a plain-object `users` now returns just `{ users: { data } }`; children of a closure or descriptor still bypass filtering and come back whole. `except: users.data` drops the whole top-level `users`, as in 2.x and in the upstream reference server; inertia-laravel keeps `users` and drops only the child, and the adapter deliberately differs from it here.
- Types: `DeferredProp` is renamed to `DeferProp`. `LazyProp`, `DeepMergeProp` and `PropValue` are removed. `MergeProp<T>` is now the descriptor interface returned by `merge()` / `deepMerge()`, not `T & {...}`.
- Core-entry adapter authors who build these objects by hand: `InertiaPage.preserveFragment` is now required, and `InertiaRequestInfo` gains the required fields `exceptOnceProps` and `mergeIntent`.
- `sharedProps` (the list of shared top-level keys) is now emitted on every page that has shared props.
- Descriptors are builders. Create them inside the handler for each request rather than mutating one hoisted to module level; the resolver itself only reads them, so a hoisted descriptor that is never changed after creation is safe to reuse.
- Sibling props still resolve concurrently, as in 2.x, and the output key order and metadata order are deterministic (insertion order).
- Errors thrown by the `onRescue` hook (or a rejected promise it returns) are logged with `console.error` and never propagated.

## Partial reloads

When the client requests a partial reload, it sends:

- `X-Inertia-Partial-Component`: the component currently mounted.
- `X-Inertia-Partial-Data`: comma-separated prop keys to include.
- `X-Inertia-Partial-Except`: comma-separated prop keys to exclude (takes precedence over `Partial-Data`).

The middleware applies this filtering automatically. Partial reload filtering is only applied when `X-Inertia-Partial-Component` matches the rendered component, so cross-page navigations don't accidentally drop props.

## Validation errors

Record validation errors with `res.inertiaErrors(errors, bag?)`. Errors are stored per bag (`default` when no bag is given); a repeated bag replaces the earlier one and other bags are kept.

- With a session, it writes `req.session.inertia.errors[bag] = errors`; the next render reads them and clears them (read-once).
- Without a session, it writes the same bags map to `res.locals.inertiaErrors` for the current response.

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

The `errors` prop is shared on every page (`{}` when empty, listed in `sharedProps`, kept on partial reloads) whether or not `flashFromSession` is on, so no `sharedProps` wiring is needed. Bags are remapped when the page is read, as in inertia-laravel's `Middleware::resolveValidationErrors`:

- Errors stored without a bag come back flat: `props.errors.email`.
- If the request carries `X-Inertia-Error-Bag: signup`, those same errors come back as `props.errors.signup.email`.
- Errors stored under a named bag (`res.inertiaErrors(errors, "createUser")`) come back keyed by name, `props.errors.createUser.email`, when no `default` bag is stored. If a `default` bag is stored as well, only `default` is returned (flat, or under the header name) and the named bags are dropped.

An explicit `errors` key in your shared or page props wins over the shared one.

## Redirects

For Inertia requests, a `302` from `res.redirect(url)` after a `PUT`, `PATCH`, `DELETE` or `QUERY` is automatically promoted to status `303`. This is required by the Inertia protocol to ensure the follow-up request is a `GET`.

Two more inertia-laravel middleware rules apply to Inertia requests:

- **Fragment redirects** (`Middleware::onRedirectWithFragment`) — a redirect whose URL contains `#` is answered with `409`, `X-Inertia-Redirect: <url>` (encoded like `Location`) and an empty body, so the client can navigate and keep the fragment. Prefetch requests get the normal redirect.
- **Empty responses** (`Middleware::onEmptyResponse`) — a `200` with an empty body (`res.end()`, `res.send("")`) becomes a redirect back to the `Referer`, or `/` without one (`303` after PUT/PATCH/DELETE/QUERY, `302` otherwise). Responses whose headers were already sent (`res.flushHeaders()`, streaming) and handlers that never respond are not covered.

For external redirects (different host or full reload), use `res.inertiaLocation()`:

```ts
res.inertiaLocation("https://billing.example.com/checkout");
```

For Inertia (XHR) visits this returns `409 X-Inertia-Location: <url>` which the client handles by performing `window.location = url`. For plain browser visits it falls back to `302 Location: <url>`.

## Asset versioning

Pass a `version` resolver. When a client's `X-Inertia-Version` header doesn't match the current value on a `GET`, the middleware responds with `409` + `X-Inertia-Location: <same-url>` and `X-Inertia-Version: <current version>` (inertia-laravel's `Middleware::onVersionChange`), and the Inertia client performs a full reload.

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

### Asset URLs for the root view

`viteManifestAssets` resolves the CSS and JS web URLs for a single manifest entry so the root view can stamp `<link>` and `<script>` tags without re-implementing manifest parsing. Same mtime caching as `viteManifestVersion`.

```ts
import { encodePageScript, viteManifestAssets } from "@blacklizard/inertia-express";

const resolveAssets = viteManifestAssets({
  manifestPath: "public/build/.vite/manifest.json",
  entry: "src/app.ts",
});

inertia({
  rootView: async ({ page }) => {
    const { css, js } = await resolveAssets();
    return `<!doctype html>
<html><head>${css ? `<link rel="stylesheet" href="${css}">` : ""}</head>
<body>
  <div id="app"></div>
  <script data-page="app" type="application/json">${encodePageScript(page)}</script>
  ${js ? `<script type="module" src="${js}"></script>` : ""}
</body></html>`;
  },
});
```

Returns `{ css: null, js: null }` when the manifest is missing, unparseable, or the entry key is absent — the root view stays renderable while assets are still being built. CSS is the first entry from the `css[]` array; if your entry emits multiple CSS files and you need them all, read the manifest yourself.

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

Set `flashFromSession: true` to surface `req.session.flash` as the top-level `flash` page key (a sibling of `props`, read on the client via `usePage().flash`) and clear it after read:

```ts
inertia({ flashFromSession: true });
```

Off by default. Requires a session middleware that exposes `req.session`. The option gates only `flash`; validation errors are shared as the `errors` prop on every page regardless (see [Validation errors](#validation-errors)).

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
- Behaviour that differs from inertia-laravel or from 2.x is listed on the docs site's [Caveats](https://blacklizard.github.io/inertia-express/guide/caveats) page.

## License

MIT
