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
