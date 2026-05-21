# API: Middleware

## `inertia(options?)`

Creates the Express middleware.

```ts
import { inertia } from "@blacklizard/inertia-express";

app.use(inertia(options));
```

**Returns:** Express `RequestHandler`

### `InertiaMiddlewareOptions`

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

interface RootViewInput {
  page: InertiaPage;
  req: Request;
  res: Response;
}

type SsrRenderer = (input: SsrRendererInput) => Promise<SsrResult | null>;

interface SsrRendererInput {
  page: InertiaPage;
  req: Request;
  res: Response;
}
```

---

## `res.inertia(component, props?, options?)`

Render an Inertia page. Returns `Promise<void>`.

```ts
await res.inertia("Dashboard", { stats }, { url: "/custom-url" });
```

### `InertiaResponseOptions`

```ts
interface InertiaResponseOptions {
  url?: string;
  clearHistory?: boolean;
  encryptHistory?: boolean;
}
```

---

## `res.inertiaLocation(url)`

Trigger an external redirect.

- **Inertia request:** `409 + X-Inertia-Location: <url>`
- **Browser request:** `302 Location: <url>`

```ts
res.inertiaLocation("https://billing.example.com/checkout");
```

---

## `res.inertiaErrors(errors, bag?)`

Stash validation errors for the next request.

```ts
res.inertiaErrors({ name: "required", email: "invalid" });
res.inertiaErrors({ name: "required" }, "createUser"); // with bag
```

---

## `res.inertiaFlash(data)`

Stash arbitrary flash data for the next request. Stored in `req.session.flash`; surfaced as the `flash` shared prop when `flashFromSession` is enabled. Replaces any flash already queued for this redirect. No-ops without a session.

```ts
res.inertiaFlash({ success: "Profile updated" });
res.redirect(303, "/profile");
```

---

## `req.flash(type?, msg?, ...args)`

`connect-flash`-compatible flash API — this package is a drop-in replacement for [`connect-flash`](https://www.npmjs.com/package/connect-flash). Buckets live in `req.session.flash`.

```ts
req.flash("info", "Welcome back");          // append → returns new count
req.flash("error", ["bad", "worse"]);       // append an array → returns count
req.flash("info", "Hello %s", user.name);   // util.format interpolation
req.flash("info");                          // read + clear one bucket → string[]
req.flash();                                // read + clear all → Record<string, string[]>
```

Throws `req.flash() requires sessions` when no session middleware is mounted.

::: warning Remove `connect-flash`
`connect-flash` must be uninstalled when adopting this package. Both attach `req.flash` and both write `req.session.flash`, so running them together double-processes the bucket and races the read-once clear. See [Redirects & Errors → Flash messages](/core/redirects#flash-messages).
:::

---

## `createInertiaSsrFetcher(options)`

Creates an `SsrRenderer` that calls an SSR HTTP server.

```ts
import { createInertiaSsrFetcher } from "@blacklizard/inertia-express";

const ssr = createInertiaSsrFetcher({
  url: "http://127.0.0.1:13714/render",
  timeoutMs: 5000,
  retries: 2,
  breakerThreshold: 5,
  breakerCooldownMs: 30_000,
  fallback: "client",
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | — | SSR endpoint URL |
| `timeoutMs` | `number` | `5000` | Per-attempt timeout |
| `retries` | `number` | `2` | Retry attempts on failure |
| `retryBaseMs` | `number` | `100` | Initial backoff delay (doubles each retry) |
| `breakerThreshold` | `number` | `5` | Open circuit after N consecutive failures |
| `breakerCooldownMs` | `number` | `30000` | How long circuit stays open |
| `fallback` | `"client" \| "throw"` | `"client"` | Behavior on SSR failure |
| `headers` | `Record<string, string>` | — | Extra headers per request |

---

## `createMemoryCacheStore(options?)`

Creates an LRU in-process `SsrCacheStore`.

```ts
import { createMemoryCacheStore } from "@blacklizard/inertia-express";

const store = createMemoryCacheStore({ max: 500 });
```

| Option | Default | Description |
|--------|---------|-------------|
| `max` | `500` | Max LRU entries |

---

## `InertiaCacheOptions`

```ts
interface InertiaCacheOptions {
  store: SsrCacheStore;
  ttlSeconds?: number;       // default 300
  keyPrefix?: string;        // default "inertia:ssr"
  vary?: (input: { req: Request; page: InertiaPage }) => boolean;
  discriminator?: (req: Request) => string | undefined;
  onError?: (op: "get" | "set" | "delete", err: unknown) => void;
}
```
