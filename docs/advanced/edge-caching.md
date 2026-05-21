# Edge Caching (CDN)

The edge cache policy applies `Cache-Control` headers to non-Inertia (first-load HTML) responses so a CDN can cache the HTML shell close to users.

The middleware always emits `Vary: Accept, X-Inertia`, preventing CDNs from serving HTML to Inertia (XHR) requests or vice versa.

## Configuration

```ts
inertia({
  edgeCache: ({ req, page }) => {
    // Authenticated users — never cache
    if (req.session?.user) return null;

    // Marketing pages — aggressive caching
    if (page.component.startsWith("Marketing/")) {
      return { sMaxAge: 3600, maxAge: 0, staleWhileRevalidate: 86400 };
    }

    // Default — short edge cache, browser revalidates
    return { sMaxAge: 60, maxAge: 0, staleWhileRevalidate: 30 };
  },
});
```

The policy function receives `{ req, res, page }` and returns a decision object or `null` to opt out for that request.

## Decision object

| Field | Type | Description |
|-------|------|-------------|
| `sMaxAge` | `number` | CDN cache TTL in seconds. `<= 0` opts out. |
| `maxAge` | `number?` | Browser `max-age` in seconds. Defaults to `0`. |
| `staleWhileRevalidate` | `number?` | `stale-while-revalidate` window in seconds. |
| `vary` | `string[]?` | Extra `Vary` values appended to the default `Accept, X-Inertia`. |

## When headers are skipped

The middleware skips applying edge cache headers when:
- The request is an Inertia (XHR) visit
- The policy returns `null`
- `sMaxAge <= 0`
- The response status is `>= 300` (3xx redirects + 4xx/5xx errors are never edge-cached)

## `Vary` header

The middleware always sets `Vary: Accept, X-Inertia`. Use the `vary` field in the decision to add more dimensions:

```ts
edgeCache: () => ({
  sMaxAge: 60,
  vary: ["Cookie", "Accept-Language"],
}),
```

## `applyEdgeCache(decision, res)`

Apply an edge-cache decision directly on any response — useful outside the Inertia middleware for non-Inertia routes that share the same policy:

```ts
import { applyEdgeCache } from "@blacklizard/inertia-express";

app.get("/robots.txt", (req, res) => {
  applyEdgeCache({ sMaxAge: 3600, maxAge: 0 }, res);
  res.type("text/plain").send("User-agent: *\nAllow: /");
});
```

## Pairing with the view cache

Edge caching and view caching are complementary:

- **View cache** — skips the SSR renderer on the web server. Hit rate matters here; cold starts after a deploy still pay SSR cost until the cache warms.
- **Edge cache** — CDN absorbs traffic before it reaches the web server. Effectively infinite scale for public pages.

```ts
inertia({
  // SSR view cache — warm the renderer on web server hits
  cache: {
    store: createMemoryCacheStore({ max: 500 }),
    ttlSeconds: 300,
    vary: ({ req }) => !req.session?.user,
  },

  // Edge cache — let CDN absorb public traffic
  edgeCache: ({ req }) =>
    req.session?.user
      ? null
      : { sMaxAge: 60, staleWhileRevalidate: 300 },
});
```

## Cache invalidation

Edge caches are time-based. For immediate invalidation on deploy:

1. **Asset versioning** — bump `version` in `inertia()`. The Inertia client detects the mismatch and forces a full reload, but the CDN cache still ages out via `s-maxage`.
2. **CDN purge API** — use your CDN's purge mechanism:
   - Cloudflare: `POST /client/v4/zones/{zone}/purge_cache`
   - Fastly: `PURGE <url>`
   - CloudFront: create an invalidation for the affected paths

For surrogate-key–based purging (Fastly, Cloudflare Cache Rules), add a `Surrogate-Key` or `Cache-Tag` header in your `rootView` and purge by tag on deploy.
