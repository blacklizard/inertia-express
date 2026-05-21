import { describe, expect, it, vi } from "vitest";
import type { SsrCacheEntry } from "../../src/core/index.js";
import { createMemoryCacheStore } from "../../src/express/memory-store.js";

function makeEntry(body: string): SsrCacheEntry {
  return {
    head: "",
    body,
    storedAt: new Date().toISOString(),
    page: {
      component: "X",
      props: {},
      url: "/",
      version: null,
      clearHistory: false,
      encryptHistory: false,
    },
  };
}

describe("createMemoryCacheStore", () => {
  it("stores and retrieves entries", async () => {
    const store = createMemoryCacheStore();
    await store.set("k", makeEntry("body"), 60);
    const got = await store.get("k");
    expect(got?.body).toBe("body");
  });

  it("returns null for missing keys", async () => {
    const store = createMemoryCacheStore();
    expect(await store.get("missing")).toBeNull();
  });

  it("expires entries past TTL", async () => {
    vi.useFakeTimers();
    const store = createMemoryCacheStore();
    await store.set("k", makeEntry("v"), 1);
    vi.advanceTimersByTime(1500);
    expect(await store.get("k")).toBeNull();
    vi.useRealTimers();
  });

  it("evicts LRU when over capacity", async () => {
    const store = createMemoryCacheStore({ max: 2 });
    await store.set("a", makeEntry("A"), 60);
    await store.set("b", makeEntry("B"), 60);
    await store.get("a"); // bump a
    await store.set("c", makeEntry("C"), 60); // should evict b
    expect(await store.get("a")).not.toBeNull();
    expect(await store.get("b")).toBeNull();
    expect(await store.get("c")).not.toBeNull();
  });

  it("delete removes entries", async () => {
    const store = createMemoryCacheStore();
    await store.set("k", makeEntry("v"), 60);
    await store.delete("k");
    expect(await store.get("k")).toBeNull();
  });

  it("re-set on the same key bumps LRU position (no self-eviction)", async () => {
    const store = createMemoryCacheStore({ max: 2 });
    await store.set("a", makeEntry("A1"), 60);
    await store.set("b", makeEntry("B"), 60);
    await store.set("a", makeEntry("A2"), 60); // overwrite — a now most recent
    await store.set("c", makeEntry("C"), 60); // evicts b, not a
    expect((await store.get("a"))?.body).toBe("A2");
    expect(await store.get("b")).toBeNull();
    expect((await store.get("c"))?.body).toBe("C");
  });

  it("evicts the only existing key when max: 1 and a second key is set", async () => {
    const store = createMemoryCacheStore({ max: 1 });
    await store.set("a", makeEntry("A"), 60);
    await store.set("b", makeEntry("B"), 60);
    expect(await store.get("a")).toBeNull();
    expect((await store.get("b"))?.body).toBe("B");
  });
});
