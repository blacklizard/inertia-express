# API: Utilities

## `encodePageScript(page)`

Encode the page object for the Inertia v3 initial-page transport — embedding
inside a `<script type="application/json" data-page="...">` tag. Escapes every
`<` to its JSON unicode escape so the payload cannot break out of `</script>`.

```ts
import { encodePageScript } from "@blacklizard/inertia-express";

encodePageScript(page: InertiaPage): string
```

```ts
rootView: ({ page }) => `
  <div id="app"></div>
  <script data-page="app" type="application/json">${encodePageScript(page)}</script>
`
```

---

## `viteManifestVersion(options)`

Returns a `VersionResolver` that reads the Vite manifest and returns a stable hash. The hash changes whenever any built asset changes.

```ts
import { viteManifestVersion } from "@blacklizard/inertia-express";

viteManifestVersion(options: ViteManifestVersionOptions): VersionResolver<Request>
```

### `ViteManifestVersionOptions`

| Option | Default | Description |
|--------|---------|-------------|
| `manifestPath` | — | Path to the Vite manifest JSON file |
| `watchMtime` | `true` | Re-read on file mtime change. `false` reads once on boot. |

```ts
inertia({
  version: viteManifestVersion({
    manifestPath: "public/build/.vite/manifest.json",
    watchMtime: true,
  }),
});
```

---

## `viteManifestAssets(options)`

Resolves the CSS and JS web URLs for a single Vite manifest entry. Pair with `viteManifestVersion` so the root view can render `<link>` and `<script>` tags without hand-rolling a manifest reader.

```ts
import { viteManifestAssets } from "@blacklizard/inertia-express";

viteManifestAssets(options: ViteManifestAssetsOptions): () => Promise<ViteManifestAssets>
```

### `ViteManifestAssetsOptions`

| Option | Default | Description |
|--------|---------|-------------|
| `manifestPath` | — | Path to the Vite manifest JSON file |
| `entry` | — | Manifest key for the entry to resolve, e.g. `src/app.ts` |
| `watchMtime` | `true` | Re-read on file mtime change. `false` reads once on boot. |

### `ViteManifestAssets`

| Field | Type | Description |
|-------|------|-------------|
| `css` | `string \| null` | First CSS file declared by the entry as a web path (leading `/`), or `null` when absent |
| `js` | `string \| null` | Compiled JS file as a web path, or `null` when absent |

Returns `{ css: null, js: null }` when the manifest is missing, unparseable, or the entry key is absent — the root view stays renderable while assets are still being built.

```ts
const resolveAssets = viteManifestAssets({
  manifestPath: "public/build/.vite/manifest.json",
  entry: "src/app.ts",
});

inertia({
  rootView: async ({ page }) => {
    const { css, js } = await resolveAssets();
    return `
      <!doctype html>
      <html>
        <head>${css ? `<link rel="stylesheet" href="${css}">` : ""}</head>
        <body>
          <div id="app"></div>
          <script data-page="app" type="application/json">${encodePageScript(page)}</script>
          ${js ? `<script type="module" src="${js}"></script>` : ""}
        </body>
      </html>
    `;
  },
});
```

---

## `applyEdgeCache(decision, res)`

Apply a CDN cache decision directly to any Express response.

```ts
import { applyEdgeCache } from "@blacklizard/inertia-express";

// Returns without setting headers when decision is null, sMaxAge <= 0,
// or res.statusCode is >= 300 (non-2xx responses are never edge-cached).
applyEdgeCache(decision: EdgeCacheDecision | null, res: Response): void
```

```ts
interface EdgeCacheDecision {
  sMaxAge: number;
  maxAge?: number;
  staleWhileRevalidate?: number;
  vary?: string[];
}
```

```ts
app.get("/sitemap.xml", (req, res) => {
  applyEdgeCache({ sMaxAge: 3600, maxAge: 0 }, res);
  res.type("application/xml").send(generateSitemap());
});
```

---

## `prerender(options)`

Programmatic cache warmup or static export.

```ts
import { prerender } from "@blacklizard/inertia-express";

const summary = await prerender(options: PrerenderOptions): Promise<PrerenderSummary>
```

See [Prerendering](/advanced/prerendering) for full documentation.

---

## `canonicalStringify(obj)`

Deterministic JSON stringify with sorted keys. Used internally for cache key computation.

```ts
import { canonicalStringify } from "@blacklizard/inertia-express";

canonicalStringify(obj: unknown): string
```

---

## `computeSsrCacheKey(input)`

Compute the cache key for a given page object. Useful for inspecting or replicating cache key logic.

```ts
import { computeSsrCacheKey } from "@blacklizard/inertia-express";

interface ComputeCacheKeyInput {
  prefix: string;            // cache namespace, e.g. "inertia:ssr"
  version: string | null;    // asset version (becomes part of the key)
  component: string;
  props: PageProps;          // fully-resolved props (post shared-merge, post-lazy)
  discriminator?: string;    // optional extra discriminator
}

computeSsrCacheKey(input: ComputeCacheKeyInput): string
// → `${prefix}:${version ?? "_"}:${component}:${sha256(props+discriminator).slice(0,32)}`
```

---

## `parseInertiaRequest(input)` (core)

Parse Inertia XHR headers from a raw header map. Used internally by the Express middleware.

```ts
import { parseInertiaRequest } from "@blacklizard/inertia-express/core";

parseInertiaRequest(input: {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
}): InertiaRequestInfo
```

---

## `scopeErrors(errors, bag)` (core)

Namespace validation errors under a bag name.

```ts
import { scopeErrors } from "@blacklizard/inertia-express/core";

scopeErrors(errors: ValidationErrors, bag: string | null): PageProps
```

```ts
scopeErrors({ name: "required" }, "createUser");
// → { errors: { createUser: { name: "required" } } }

scopeErrors({ name: "required" }, null);
// → { errors: { name: "required" } }
```

---

## `inertiaRedirectStatus(method, fallback)` (core)

Returns the correct redirect status code for a given HTTP method.

```ts
import { inertiaRedirectStatus } from "@blacklizard/inertia-express/core";

inertiaRedirectStatus(method: string, fallback?: number): number
```

Returns `303` for `PUT`, `PATCH`, `DELETE`. Returns `fallback` (default `302`) for all other methods.
