import type { SsrCacheEntry, SsrCacheStore } from '../core/index.js';

/**
 * In-process LRU + TTL cache for SSR responses.
 *
 * Suitable as L1 cache in front of Redis (`@blacklizard/inertia-cache-redis`)
 * or by itself for low-traffic / single-instance deployments.
 *
 * Notes:
 *   - Bounded by entry count (`max`), not bytes. Keep it conservative.
 *   - TTL is enforced lazily on `get()` — expired entries are removed at
 *     read time and never returned.
 *   - Not safe across processes. For multi-pod web tiers, layer Redis on top.
 */
export interface MemoryCacheStoreOptions {
  /** Maximum number of entries before LRU eviction kicks in. Default 500. */
  max?: number;
}

interface Slot {
  entry: SsrCacheEntry;
  expiresAt: number;
}

/**
 * Build an in-process LRU + TTL {@link SsrCacheStore}. See
 * {@link MemoryCacheStoreOptions} for the full contract.
 *
 * @param options Store configuration; defaults applied when omitted.
 */
export function createMemoryCacheStore(options: MemoryCacheStoreOptions = {}): SsrCacheStore {
  const max = options.max ?? 500;
  const map = new Map<string, Slot>();

  /**
   * Drop oldest-inserted entries until `map.size <= max`. Relies on `Map`'s
   * insertion-order iteration to identify the LRU entry.
   */
  function evict(): void {
    while (map.size > max) {
      const oldest = map.keys().next().value;

      if (oldest === undefined) {
        return;
      }

      map.delete(oldest);
    }
  }

  return {
    /**
     * Return the cached entry or `null` on miss / expired. Touched entries
     * are reinserted so they become the most-recently-used.
     *
     * @param key Cache key.
     */
    async get(key) {
      const slot = map.get(key);

      if (!slot) {
        return null;
      }

      if (slot.expiresAt < Date.now()) {
        map.delete(key);

        return null;
      }

      // LRU bump: re-insert to move to end of insertion order.
      map.delete(key);
      map.set(key, slot);

      return slot.entry;
    },
    /**
     * Write an entry with the given TTL, replacing any prior value. Runs LRU
     * eviction afterward so `max` is never exceeded.
     *
     * @param key Cache key.
     * @param entry Value to store.
     * @param ttlSeconds Time-to-live in seconds.
     */
    async set(key, entry, ttlSeconds) {
      const expiresAt = Date.now() + ttlSeconds * 1000;
      map.delete(key);
      map.set(key, { entry, expiresAt });
      evict();
    },
    /**
     * Remove an entry. Idempotent — missing keys are silently ignored.
     *
     * @param key Cache key.
     */
    async delete(key) {
      map.delete(key);
    },
  };
}
