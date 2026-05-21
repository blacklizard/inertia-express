import type { SsrCacheEntry, SsrCacheStore } from '@blacklizard/inertia-express/core';

/**
 * Structural type representing the subset of the `redis` (node-redis v4+)
 * client API that we use. Defined here so this package does not need a
 * runtime dependency on a specific node-redis version — pass any client
 * with these methods, including `ioredis` (which has a compatible signature
 * for `get`/`set`/`del`).
 */
export interface RedisClientLike {
  get: (key: string) => Promise<string | null>;
  /**
   * node-redis v4+ accepts an options object: `set(key, value, { EX: n })`
   * for TTL in seconds. We pass that shape; the call is type-erased here so
   * either `redis@4+` or `ioredis` (which uses `set(key, value, "EX", n)`)
   * can be adapted at construction time via `setMode`.
   */
  set: (key: string, value: string, options?: unknown) => Promise<unknown>;
  del: (keys: string | string[]) => Promise<number>;
}

/**
 * Construction options for {@link createRedisCacheStore}.
 */
export interface RedisCacheStoreOptions {
  /** Redis client. node-redis v4+ recommended; ioredis works with `setMode: "ioredis"`. */
  client: RedisClientLike;
  /**
   * Calling convention for `SET` with TTL.
   *   - `"node-redis"` (default): `client.set(key, value, { EX: ttl })`
   *   - `"ioredis"`: `client.set(key, value, "EX", ttl)`
   */
  setMode?: 'node-redis' | 'ioredis';
  /**
   * Optional key-prefix wrapper applied on top of whatever prefix the
   * adapter computes. Use this for additional namespacing (per-environment,
   * per-tenant, etc.).
   */
  keyPrefix?: string;
  /**
   * Called when a Redis op throws. Cache failures are non-fatal — the
   * adapter's middleware swallows them — but logging here is recommended.
   */
  onError?: (op: 'get' | 'set' | 'delete', err: unknown) => void;
}

/**
 * Join an optional namespace prefix onto a cache key with a `:` separator.
 *
 * @param prefix Optional namespace; when undefined the key is returned unchanged.
 * @param key Cache key to prefix.
 */
function withPrefix(prefix: string | undefined, key: string): string {
  return prefix ? `${prefix}:${key}` : key;
}

/**
 * Delete a key, swallowing any failure after reporting it via `onError`.
 * Used to evict a poisoned (unparseable) cache entry without letting the
 * cleanup error mask the original read.
 *
 * @param client Redis client.
 * @param key Fully-prefixed key to remove.
 * @param onError Optional error reporter.
 */
async function bestEffortDelete(
  client: RedisClientLike,
  key: string,
  onError: RedisCacheStoreOptions['onError'],
): Promise<void> {
  try {
    await client.del(key);
  } catch (delErr) {
    onError?.('delete', delErr);
  }
}

/**
 * Build a {@link SsrCacheStore} backed by Redis.
 *
 * Entries are stored as JSON strings. A `JSON.parse` failure on read is
 * treated as a cache miss (the poisoned key is reported via `onError` and
 * best-effort deleted) so a corrupted entry can never break a page render.
 *
 * @param options Store configuration — see {@link RedisCacheStoreOptions}.
 */
export function createRedisCacheStore(options: RedisCacheStoreOptions): SsrCacheStore {
  const setMode = options.setMode ?? 'node-redis';
  const prefix = options.keyPrefix;

  return {
    /**
     * Read a cache entry. Returns `null` on miss or on poisoned (unparseable)
     * data; rethrows when the Redis client itself errors after reporting via
     * `onError`.
     *
     * @param key Cache key, before prefixing.
     */
    async get(key: string): Promise<SsrCacheEntry | null> {
      const fullKey = withPrefix(prefix, key);

      try {
        const raw = await options.client.get(fullKey);

        if (raw === null) {
          return null;
        }

        try {
          return JSON.parse(raw) as SsrCacheEntry;
        } catch (parseErr) {
          // Poisoned key — report it, best-effort delete, then treat as a miss.
          options.onError?.('get', parseErr);
          await bestEffortDelete(options.client, fullKey, options.onError);

          return null;
        }
      } catch (err) {
        options.onError?.('get', err);
        throw err;
      }
    },
    /**
     * Write a cache entry with a TTL. Reports via `onError` and rethrows on
     * Redis failure (the calling middleware swallows the throw — writes are
     * fire-and-forget).
     *
     * @param key Cache key, before prefixing.
     * @param value Entry to JSON-serialize and store.
     * @param ttlSeconds Time-to-live in seconds.
     */
    async set(key: string, value: SsrCacheEntry, ttlSeconds: number): Promise<void> {
      const fullKey = withPrefix(prefix, key);
      const payload = JSON.stringify(value);

      try {
        if (setMode === 'ioredis') {
          // ioredis: client.set(key, value, "EX", ttl)
          const setFn = options.client.set as unknown as (
            k: string,
            v: string,
            mode: string,
            ttl: number,
          ) => Promise<unknown>;
          await setFn(fullKey, payload, 'EX', ttlSeconds);
        } else {
          // node-redis v4+: client.set(key, value, { EX: ttl })
          await options.client.set(fullKey, payload, { EX: ttlSeconds });
        }
      } catch (err) {
        options.onError?.('set', err);
        throw err;
      }
    },
    /**
     * Remove a cache entry. Reports via `onError` and rethrows on failure.
     *
     * @param key Cache key, before prefixing.
     */
    async delete(key: string): Promise<void> {
      const fullKey = withPrefix(prefix, key);

      try {
        await options.client.del(fullKey);
      } catch (err) {
        options.onError?.('delete', err);
        throw err;
      }
    },
  };
}
