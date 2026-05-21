# View Cache

The view cache stores rendered SSR HTML so subsequent requests skip the SSR renderer entirely. Cache hits serve in under a millisecond.

The cache key incorporates the page component, resolved props, URL, and asset version. A deploy that bumps the version retires all existing entries automatically.

## Basic setup

```ts
import { inertia, createMemoryCacheStore } from "@blacklizard/inertia-express";

app.use(
  inertia({
    ssr: mySsrRenderer,
    cache: {
      store: createMemoryCacheStore({ max: 500 }),
      ttlSeconds: 300,
    },
  }),
);
```

## `InertiaCacheOptions`

```ts
interface InertiaCacheOptions {
  store: SsrCacheStore;
  ttlSeconds?: number;
  keyPrefix?: string;
  vary?: (input: { req: Request; page: InertiaPage }) => boolean;
  discriminator?: (req: Request) => string | undefined;
  onError?: (op: "get" | "set" | "delete", err: unknown) => void;
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `store` | — | Cache backend. Use `createMemoryCacheStore` or `@blacklizard/inertia-cache-redis`. |
| `ttlSeconds` | `300` | Cache entry TTL in seconds. |
| `keyPrefix` | `"inertia:ssr"` | Key namespace. |
| `vary` | GET + 200 + non-Inertia | Per-request bypass. Return `false` to skip read and write entirely. |
| `discriminator` | — | Extra cache-key segment. Useful for locale, theme, A/B bucket. |
| `onError` | — | Called on `get`/`set`/`delete` failures. Cache failures are **non-fatal** — the request still renders. |

## In-process memory cache — `createMemoryCacheStore`

LRU-based in-process cache. Fast, zero dependencies. Suitable for single-process deployments.

```ts
import { createMemoryCacheStore } from "@blacklizard/inertia-express";

const store = createMemoryCacheStore({ max: 500 });
```

| Option | Default | Description |
|--------|---------|-------------|
| `max` | `500` | Maximum number of entries before LRU eviction. |

## Redis cache — `@blacklizard/inertia-cache-redis`

For multi-process or multi-pod deployments where cache must be shared across instances:

```ts
import { createRedisCacheStore } from "@blacklizard/inertia-cache-redis";
import { createClient } from "redis";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const store = createRedisCacheStore({
  client: redis,
  keyPrefix: "inertia",
  onError: (op, err) => console.warn(`[redis] cache ${op} failed`, err),
});

inertia({ cache: { store, ttlSeconds: 600 } });
```

See [`@blacklizard/inertia-cache-redis`](/packages/inertia-cache-redis) for full options.

## L1 + L2 layering

Stack memory as L1 in front of Redis as L2 for best latency on a multi-process tier:

```ts
import { createRedisCacheStore } from "@blacklizard/inertia-cache-redis";
import { createMemoryCacheStore } from "@blacklizard/inertia-express";

const memoryStore = createMemoryCacheStore({ max: 200 });
const redisStore = createRedisCacheStore({ client: redis });

// Use Redis in multi-process; memory in single process
const store = REDIS_URL ? redisStore : memoryStore;

inertia({ cache: { store, ttlSeconds: 600 } });
```

For a proper two-layer store, check the `@blacklizard/inertia-cache-redis` README for a layered example.

## Bypassing the cache

Use the `vary` option to skip caching for specific requests:

```ts
inertia({
  cache: {
    store,
    // Skip cache for authenticated users — their props are personalized
    vary: ({ req }) => !req.session?.user,

    // Add locale as a cache dimension
    discriminator: (req) => req.headers["accept-language"]?.toString(),
  },
});
```

## `SsrCacheStore` interface

Implement this interface to build a custom cache backend:

```ts
interface SsrCacheStore {
  get(key: string): Promise<SsrCacheEntry | null>;
  set(key: string, value: SsrCacheEntry, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface SsrCacheEntry {
  head: string | string[];
  body: string;
  bodyIsFullRoot?: boolean;
  storedAt: string;   // ISO timestamp when stored
  page: InertiaPage;  // page object the entry corresponds to
}
```

## Cache key computation

Use `computeSsrCacheKey` from the core to inspect or replicate the key logic:

```ts
import { computeSsrCacheKey } from "@blacklizard/inertia-express";

const key = computeSsrCacheKey({
  prefix: "inertia:ssr",
  version,
  component: page.component,
  props: page.props,
  discriminator,
});
// → `${prefix}:${version ?? "_"}:${component}:${sha256(props+discriminator).slice(0,32)}`
```
