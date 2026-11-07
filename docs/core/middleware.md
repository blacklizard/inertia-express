# Middleware

`inertia(options?)` creates the Express middleware. Mount it before your route handlers.

```ts
import { inertia } from "@blacklizard/inertia-express";

app.use(inertia({ ...options }));
```

## What the middleware does

On every request it:

1. Parses Inertia XHR headers into `req.inertia`
2. Attaches `req.flash()` — a `connect-flash`-compatible flash API
3. Attaches `res.inertia()`, `res.inertiaLocation()`, `res.inertiaErrors()`, `res.inertiaFlash()` to the response
4. Promotes `PUT`/`PATCH`/`DELETE`/`QUERY` redirects to `303` for Inertia requests
5. Answers an Inertia redirect to a URL with a `#` fragment with `409 + X-Inertia-Redirect` (not for prefetch requests) — see [Redirects with URL fragments](/core/redirects#redirects-with-url-fragments)
6. Turns an empty `200` on an Inertia request into a redirect back to the `Referer` (or `/`) — see [Empty responses](/core/redirects#empty-responses)
7. Shares validation errors as the `errors` prop on every page — see [`errors` is shared automatically](/core/redirects#errors-is-shared-automatically)
8. Sets `Vary: Accept, X-Inertia` so CDNs don't mix HTML and JSON variants

## Options

```ts
interface InertiaMiddlewareOptions {
  version?: VersionResolver<Request>;
  sharedProps?: SharedPropsInput<Request>;
  rootView?: RootViewRenderer;
  ssr?: SsrRenderer;
  cache?: InertiaCacheOptions;
  edgeCache?: EdgeCachePolicy;
  flashFromSession?: boolean;
  onRescue?: (error: unknown, path: string, req: Request) => void;
}

type VersionResolver<Req> =
  | string
  | null
  | (() => string | null | Promise<string | null>)
  | ((req: Req) => string | null | Promise<string | null>);

type SharedPropsInput<Req> =
  | PageProps
  | ((req: Req) => PageProps | Promise<PageProps>);

type RootViewRenderer = (input: RootViewInput) => string | Promise<string>;
```

### `version`

Asset version string. When a client sends a stale `X-Inertia-Version` header on a `GET`, the middleware responds `409 + X-Inertia-Location` to force a full reload, with `X-Inertia-Version` set to the server's current version (inertia-laravel's `Middleware::onVersionChange`).

```ts
inertia({
  // Static string
  version: "abc123",

  // Function — evaluated per request
  version: () => process.env.ASSET_VERSION ?? null,

  // From Vite manifest (recommended)
  version: viteManifestVersion({ manifestPath: "public/build/.vite/manifest.json" }),
});
```

`null` disables version mismatch detection (default).

### `sharedProps`

Props merged into every page response. Per-page props win on key collisions.

```ts
inertia({
  sharedProps: async (req) => ({
    auth: { user: req.user ?? null },
    csrf: req.csrfToken?.(),
    flash: req.session?.flash ?? {},
  }),
});
```

### `rootView`

Custom HTML renderer for non-Inertia (first-load) responses. Receives the resolved page object and must return a complete HTML document.

```ts
inertia({
  rootView: ({ page, req, res }) => `
    <!doctype html>
    <html lang="en">
      <head>
        <title>My App</title>
        ${res.locals.ssr?.head ?? ""}
      </head>
      <body>
        <div id="app">${res.locals.ssr?.body ?? ""}</div>
        <script data-page="app" type="application/json">${JSON.stringify(page).replace(/</g, "\\u003C")}</script>
        <script type="module" src="/build/app.js"></script>
      </body>
    </html>
  `,
});
```

When omitted, a minimal default shell is used:

```html
<!doctype html>
<html>
  <head>...</head>
  <body>
    <div id="app"></div>
    <script data-page="app" type="application/json">...</script>
  </body>
</html>
```

### `ssr`

SSR hook. Called on non-Inertia (HTML) responses to produce `{ head, body }`. The result is stored on `res.locals.ssr` for your `rootView` to use. See [Server-Side Rendering](/advanced/ssr).

### `cache`

View cache layered on top of the SSR hook. Cached HTML skips the SSR renderer entirely. See [View Cache](/advanced/caching).

### `edgeCache`

CDN `Cache-Control` policy for non-Inertia responses. See [Edge Caching](/advanced/edge-caching).

### `flashFromSession`

When `true`, auto-promotes `req.session.flash` into the **top-level `flash` page key** (a sibling of `props`, not a prop — matching inertia-laravel's `Response::resolveFlashData`), then clears it after read (read-once). Read it on the client with `usePage().flash`. Off by default. It gates only `flash`: the `errors` prop is shared on every page whether this is on or off (see [`errors` is shared automatically](/core/redirects#errors-is-shared-automatically)).

```ts
inertia({ flashFromSession: true });
```

With this on, the flash helpers feed the page's top-level `flash` with no extra wiring:

```ts
// connect-flash style — accumulates { type: string[] }
req.flash("success", "Saved!");

// arbitrary-object style — replaces req.session.flash
res.inertiaFlash({ success: "Saved!" });
```

See [Redirects & Errors → Flash messages](/core/redirects#flash-messages) for the full flow and the `connect-flash` migration guide.

### `onRescue`

Called whenever a deferred prop marked [`.rescue()`](/core/props#rescuing-failures) throws during resolution. The failing prop is dropped from the page and its path is listed in the page object's `rescuedProps`; use this hook to log or report the swallowed error. Without it, rescued errors are logged with `console.error`.

```ts
inertia({
  onRescue: (error, path, req) => {
    logger.warn({ err: error, prop: path, url: req.originalUrl }, "Inertia prop rescued");
  },
});
```

Failures of the hook itself are contained: a synchronous throw or a rejected returned promise is logged with `console.error` and never propagates or surfaces as an unhandled rejection.

## Request augmentation

After the middleware runs, `req.inertia` is populated:

```ts
interface InertiaRequestInfo {
  isInertia: boolean;         // true if X-Inertia: true header present
  version: string | null;     // X-Inertia-Version value
  partialComponent: string | null;  // X-Inertia-Partial-Component
  partialOnly: string[] | null;     // X-Inertia-Partial-Data (split by comma)
  partialExcept: string[] | null;   // X-Inertia-Partial-Except (split by comma)
  errorBag: string | null;          // X-Inertia-Error-Bag
  resetKeys: string[] | null;       // X-Inertia-Reset (split by comma)
  exceptOnceProps: string[];        // X-Inertia-Except-Once-Props (split by comma; [] when absent)
  mergeIntent: "append" | "prepend"; // X-Inertia-Infinite-Scroll-Merge-Intent ("prepend" only on that exact value)
  method: string;                   // uppercased HTTP method
  url: string;                      // request URL (from req.originalUrl)
}
```

The middleware also attaches `req.flash()` — a `connect-flash`-compatible API:

```ts
req.flash("info", "Welcome back");  // setter → new bucket count
req.flash("info");                  // getter → string[], clears the bucket
req.flash();                        // getter → all buckets, clears them
```

## Response augmentation

| Method | Description |
|--------|-------------|
| `res.inertia(component, props?, options?)` | Render an Inertia page |
| `res.inertiaLocation(url)` | External redirect (409 for Inertia, 302 for browser) |
| `res.inertiaErrors(errors, bag?)` | Stash validation errors for the next request |
| `res.inertiaFlash(data)` | Stash arbitrary flash data for the next request |
| `res.inertiaError(status, message?)` | Render an error page at the given HTTP status |

### `res.inertiaError(status, message?)`

Renders an error page at the given HTTP status. Use it from a central error
handler so routes can simply `throw` and let the handler decide how an error
surfaces to the user.

```ts
res.inertiaError(404);
res.inertiaError(500, "Something went wrong on our end");
```

- **Inertia request** → renders the client `Error` component via
  `res.inertia("Error", { status })`, with the resolved HTTP status on the
  response. The component reads `status` from its props to decide what to show.
- **Plain browser load** (non-Inertia), or a **render/SSR failure** on the
  Inertia path → falls back to a minimal standalone HTML page built by
  [`renderErrorPage`](#rendererrorpage), so the user never sees a raw JSON
  error or a blank screen even when the SPA cannot mount.

The `message` argument only affects the standalone HTML fallback; the Inertia
path passes just `status` to the `Error` component.

### `renderErrorPage({ status, message? })`

Standalone, SPA-less HTML error page used as the hard fallback by
`res.inertiaError`. Exported from both `@blacklizard/inertia-express` and
`@blacklizard/inertia-express/core` so you can render it directly (e.g. from a
framework-agnostic adapter). `message` defaults to a sensible label for common
statuses, then to a generic line; all interpolated values are HTML-escaped.
