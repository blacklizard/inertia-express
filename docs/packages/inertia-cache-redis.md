# @blacklizard/inertia-cache-redis

Redis-backed SSR view cache store for `@blacklizard/inertia-express`.

## Install

```bash
pnpm add @blacklizard/inertia-cache-redis redis
```

Or with ioredis:

```bash
pnpm add @blacklizard/inertia-cache-redis ioredis
```

## Usage

```ts
import { createRedisCacheStore } from "@blacklizard/inertia-cache-redis";
import { inertia } from "@blacklizard/inertia-express";
import { createClient } from "redis";

const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (err) => console.warn("[redis] error", err));
await redis.connect();

app.use(
  inertia({
    ssr: mySsrRenderer,
    cache: {
      store: createRedisCacheStore({
        client: redis,
        keyPrefix: "inertia",
        onError: (op, err) => console.warn(`[redis] cache ${op} failed`, err),
      }),
      ttlSeconds: 600,
    },
  }),
);
```

## `createRedisCacheStore(options)`

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `client` | — | Redis client. `node-redis` v4+ recommended. |
| `setMode` | `"node-redis"` | `"node-redis"` uses `{ EX: n }` options object. `"ioredis"` uses `"EX", n` positional args. |
| `keyPrefix` | — | Additional key namespace on top of the adapter's prefix. |
| `onError` | — | Called on `get`/`set`/`delete` failures. Errors are non-fatal. |

## `RedisClientLike` interface

Structural type for the Redis client. Any client with `get`, `set`, and `del` methods works:

```ts
interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: unknown): Promise<unknown>;
  del(keys: string | string[]): Promise<number>;
}
```

## ioredis setup

```ts
import { createRedisCacheStore } from "@blacklizard/inertia-cache-redis";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

const store = createRedisCacheStore({
  client: redis as unknown as RedisClientLike,
  setMode: "ioredis",
  keyPrefix: "inertia",
});
```

## L1 + L2 layering

Stack in-process memory (L1) in front of Redis (L2) for best latency on multi-pod deployments:

```ts
import { createRedisCacheStore } from "@blacklizard/inertia-cache-redis";
import { createMemoryCacheStore } from "@blacklizard/inertia-express";
import type { SsrCacheStore } from "@blacklizard/inertia-express/core";

function createLayeredStore(l1: SsrCacheStore, l2: SsrCacheStore): SsrCacheStore {
  return {
    async get(key) {
      const hit = await l1.get(key);
      if (hit) return hit;
      const miss = await l2.get(key);
      if (miss) await l1.set(key, miss, 60); // populate L1
      return miss;
    },
    async set(key, value, ttl) {
      await Promise.all([l1.set(key, value, 60), l2.set(key, value, ttl)]);
    },
    async delete(key) {
      await Promise.all([l1.delete(key), l2.delete(key)]);
    },
  };
}

const store = createLayeredStore(
  createMemoryCacheStore({ max: 200 }),
  createRedisCacheStore({ client: redis }),
);
```

## Poisoned key handling

If a Redis value fails JSON.parse (e.g. corrupted data), the store treats it as a cache miss and attempts to delete the key — it never surfaces a parse error to the caller.

## Error handling

All Redis errors are non-fatal. The cache middleware swallows them and falls through to the SSR renderer. Pass `onError` to log them:

```ts
createRedisCacheStore({
  client: redis,
  onError: (op, err) => logger.warn({ op, err }, "redis cache error"),
});
```
