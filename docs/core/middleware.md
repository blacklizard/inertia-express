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
4. Promotes `PUT`/`PATCH`/`DELETE` redirects to `303` for Inertia requests
5. Sets `Vary: Accept, X-Inertia` so CDNs don't mix HTML and JSON variants

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

Asset version string. When a client sends a stale `X-Inertia-Version` header on a `GET`, the middleware responds `409 + X-Inertia-Location` to force a full reload.

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
    errors: req.session?.errors ?? {},
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

When `true`, auto-promotes `req.session.errors` and `req.session.flash` into shared props as `errors` and `flash`, then clears them after read (read-once). Off by default — most apps wire flash/errors via `sharedProps`.

```ts
inertia({ flashFromSession: true });
```

With this on, the flash helpers feed the page props with no extra wiring:

```ts
// connect-flash style — accumulates { type: string[] }
req.flash("success", "Saved!");

// arbitrary-object style — replaces req.session.flash
res.inertiaFlash({ success: "Saved!" });
```

See [Redirects & Errors → Flash messages](/core/redirects#flash-messages) for the full flow and the `connect-flash` migration guide.

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
