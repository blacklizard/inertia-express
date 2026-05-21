import type { SsrCacheEntry } from "@blacklizard/inertia-express/core";
import { describe, expect, it, vi } from "vitest";
import { createRedisCacheStore } from "../src/index.js";

function fakeClient() {
  const map = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => map.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      map.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      let n = 0;
      for (const k of keys) {
        if (map.delete(k)) {
          n += 1;
        }
      }
      return n;
    }),
    _map: map,
  };
}

function entry(body: string): SsrCacheEntry {
  return {
    head: "",
    body,
    storedAt: "2026-01-01T00:00:00.000Z",
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

describe("createRedisCacheStore (node-redis mode)", () => {
  it("set + get round-trip", async () => {
    const client = fakeClient();
    const store = createRedisCacheStore({ client });
    await store.set("k", entry("hi"), 60);
    const got = await store.get("k");
    expect(got?.body).toBe("hi");
    expect(client.set).toHaveBeenCalledWith("k", expect.any(String), { EX: 60 });
  });

  it("returns null for missing key", async () => {
    const client = fakeClient();
    const store = createRedisCacheStore({ client });
    expect(await store.get("missing")).toBeNull();
  });

  it("treats poisoned JSON as miss and deletes the key", async () => {
    const client = fakeClient();
    client._map.set("k", "{not json");
    const store = createRedisCacheStore({ client });
    expect(await store.get("k")).toBeNull();
    expect(client.del).toHaveBeenCalled();
  });

  it("reports poisoned JSON via onError", async () => {
    const client = fakeClient();
    client._map.set("k", "{not json");
    const onError = vi.fn();
    const store = createRedisCacheStore({ client, onError });
    expect(await store.get("k")).toBeNull();
    expect(onError).toHaveBeenCalledWith("get", expect.any(Error));
  });

  it("applies keyPrefix to all ops", async () => {
    const client = fakeClient();
    const store = createRedisCacheStore({ client, keyPrefix: "app1" });
    await store.set("k", entry("v"), 60);
    expect(client.set.mock.calls[0]?.[0]).toBe("app1:k");
    await store.get("k");
    expect(client.get.mock.calls[0]?.[0]).toBe("app1:k");
    await store.delete("k");
    expect(client.del.mock.calls[0]?.[0]).toBe("app1:k");
  });

  it("delete removes a stored entry", async () => {
    const client = fakeClient();
    const store = createRedisCacheStore({ client });
    await store.set("k", entry("v"), 60);
    await store.delete("k");
    expect(client.del).toHaveBeenCalledWith("k");
    expect(await store.get("k")).toBeNull();
  });

  it("invokes onError when client throws", async () => {
    const onError = vi.fn();
    const client = {
      get: vi.fn(async () => {
        throw new Error("bang");
      }),
      set: vi.fn(),
      del: vi.fn(),
    };
    const store = createRedisCacheStore({ client, onError });
    await expect(store.get("k")).rejects.toThrow("bang");
    expect(onError).toHaveBeenCalledWith("get", expect.any(Error));
  });
});

describe("createRedisCacheStore (ioredis mode)", () => {
  it("calls SET with positional EX/ttl args", async () => {
    const client = fakeClient();
    const store = createRedisCacheStore({ client, setMode: "ioredis" });
    await store.set("k", entry("v"), 30);
    expect(client.set).toHaveBeenCalledWith("k", expect.any(String), "EX", 30);
  });
});

describe("createRedisCacheStore — get() with non-string Redis return", () => {
  it("treats a plain-object return as a miss, calls onError, and deletes the key", async () => {
    const onError = vi.fn();
    const client = {
      get: vi.fn(async () => ({ body: "x" }) as unknown as string),
      set: vi.fn(),
      del: vi.fn(async () => 1),
    };
    const store = createRedisCacheStore({ client, onError });
    const result = await store.get("k");
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith("get", expect.any(Error));
    expect(client.del).toHaveBeenCalledWith("k");
  });

  it("treats an array return as a miss, calls onError, and deletes the key", async () => {
    const onError = vi.fn();
    const client = {
      get: vi.fn(async () => [1, 2, 3] as unknown as string),
      set: vi.fn(),
      del: vi.fn(async () => 1),
    };
    const store = createRedisCacheStore({ client, onError });
    const result = await store.get("k");
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith("get", expect.any(Error));
    expect(client.del).toHaveBeenCalledWith("k");
  });
});

describe("createRedisCacheStore — set() with circular reference", () => {
  it("rejects without calling onError when JSON.stringify throws", async () => {
    const onError = vi.fn();
    const client = fakeClient();
    const store = createRedisCacheStore({ client, onError });
    const circular = entry("v");
    (circular as Record<string, unknown>).self = circular;
    await expect(store.set("k", circular, 60)).rejects.toThrow();
    expect(onError).not.toHaveBeenCalled();
  });
});
