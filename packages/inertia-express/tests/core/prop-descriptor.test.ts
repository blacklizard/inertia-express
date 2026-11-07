import { describe, expect, it } from "vitest";
import PropDescriptor from "../../src/core/prop-descriptor.js";
import { always, deepMerge, defer, isPropDescriptor, merge, once, optional, scroll } from "../../src/core/props.js";

const meta = { pageName: "page", previousPage: null, nextPage: 2, currentPage: 1 };

const d = (p: unknown): PropDescriptor => p as PropDescriptor;

describe("merge descriptors", () => {
  it("merge(v) appends at root", () => {
    const p = d(merge({ a: 1 }));
    expect(p.kind).toBe("merge");
    expect(p.merges).toBe(true);
    expect(p.appends).toBe(true);
    expect(p.appendsAtRoot).toBe(true);
    expect(p.prependsAtRoot).toBe(false);
    expect(p.deep).toBe(false);
  });

  it("deepMerge(v) is deep and still appends at root", () => {
    const p = d(deepMerge({ a: 1 }));
    expect(p.merges).toBe(true);
    expect(p.deep).toBe(true);
    expect(p.appendsAtRoot).toBe(true);
  });

  it("append('data') records a path and leaves the root", () => {
    const p = d(merge({ data: [] }).append("data"));
    expect(p.appendsAtRoot).toBe(false);
    expect(p.prependsAtRoot).toBe(false);
    expect(p.appendPaths).toEqual(["data"]);
  });

  it("prepend('data', 'id') records a path and a match-on path", () => {
    const p = d(merge({ data: [] }).prepend("data", "id"));
    expect(p.prependPaths).toEqual(["data"]);
    expect(p.matchOnPaths).toEqual(["data.id"]);
    expect(p.appends).toBe(true);
  });

  it("prepend(true) flips the append flag", () => {
    const p = d(merge([1]).prepend(true));
    expect(p.appends).toBe(false);
    expect(p.prependsAtRoot).toBe(true);
    expect(p.appendsAtRoot).toBe(false);
  });

  it("append with a record maps path to matchOn", () => {
    const p = d(merge({}).append({ data: "id", meta: "key" }));
    expect(p.appendPaths).toEqual(["data", "meta"]);
    expect(p.matchOnPaths).toEqual(["data.id", "meta.key"]);
  });

  it("append with a list records every path", () => {
    const p = d(merge({}).append(["a", "b"]));
    expect(p.appendPaths).toEqual(["a", "b"]);
  });

  it("paths survive a later root flag flip", () => {
    const p = d(merge([1]).append("data").prepend(true));
    expect(p.appends).toBe(false);
    expect(p.appendPaths).toEqual(["data"]);
    expect(p.appendsAtRoot).toBe(false);
    expect(p.prependsAtRoot).toBe(false);
  });

  it("matchOn accepts a string or a list", () => {
    expect(d(merge({}).matchOn("id")).matchOnPaths).toEqual(["id"]);
    expect(d(merge({}).matchOn(["id", "slug"])).matchOnPaths).toEqual(["id", "slug"]);
  });

  it("matchOn replaces paths that append/prepend accumulated", () => {
    expect(d(merge({}).append("data", "id").matchOn("slug")).matchOnPaths).toEqual(["slug"]);
    expect(d(merge({}).matchOn("a").prepend("x", "k")).matchOnPaths).toEqual(["a", "x.k"]);
  });

  it("prepend with a list or a record records every path", () => {
    expect(d(merge({}).prepend(["a", "b"])).prependPaths).toEqual(["a", "b"]);
    const p = d(merge({}).prepend({ data: "id", meta: "key" }));
    expect(p.prependPaths).toEqual(["data", "meta"]);
    expect(p.matchOnPaths).toEqual(["data.id", "meta.key"]);
  });

  it("does not mutate the wrapped value", () => {
    const value = { data: [1] };
    merge(value).append("data").matchOn("id");
    expect(Object.getOwnPropertyNames(value)).toEqual(["data"]);
    expect(Object.getOwnPropertySymbols(value)).toEqual([]);
  });
});

describe("defer descriptors", () => {
  it("defer(fn) uses the default group", () => {
    const p = d(defer(() => 1));
    expect(p.kind).toBe("defer");
    expect(p.defers).toBe(true);
    expect(p.group).toBe("default");
    expect(p.ignoreFirstLoad).toBe(true);
    expect(p.rescues).toBe(false);
  });

  it("defer(fn, 'g') keeps the group", () => {
    expect(d(defer(() => 1, "g")).group).toBe("g");
  });

  it("defer(fn).rescue() opts into rescue", () => {
    expect(d(defer(() => 1).rescue()).rescues).toBe(true);
    expect(d(defer(() => 1).rescue(false)).rescues).toBe(false);
  });

  it("defer(fn).merge().append('data') composes", () => {
    const p = d(defer(() => ({ data: [] })).merge().append("data"));
    expect(p.merges).toBe(true);
    expect(p.appendPaths).toEqual(["data"]);
    expect(p.defers).toBe(true);
  });
});

describe("once descriptors", () => {
  it("once(fn).as('plans').until(60).expiresAt(now) is now + 60s in ms", () => {
    const p = d(once(() => 1).as("plans").until(60));
    expect(p.resolvesOnce).toBe(true);
    expect(p.onceKey).toBe("plans");
    expect(p.ttlSeconds).toBe(60);
    expect(p.expiresAt(1_000_000)).toBe(1_060_000);
  });

  it("until(Date) uses the date", () => {
    expect(d(once(() => 1).until(new Date(5_000))).expiresAt()).toBe(5000);
  });

  it("no ttl means null expiry", () => {
    expect(d(once(() => 1)).expiresAt()).toBeNull();
  });

  it("the last until() call wins", () => {
    expect(d(once(() => 1).until(new Date(5_000)).until(60)).expiresAt(1_000_000)).toBe(1_060_000);
    expect(d(once(() => 1).until(60).until(new Date(5_000))).expiresAt(1_000_000)).toBe(5_000);
  });

  it("fresh() marks the prop fresh", () => {
    expect(d(once(() => 1)).isFresh).toBe(false);
    expect(d(once(() => 1).fresh()).isFresh).toBe(true);
  });

  it("optional(fn).once(true, 'k', 10) composes once onto optional", () => {
    const p = d(optional(() => 1).once(true, "k", 10));
    expect(p.kind).toBe("optional");
    expect(p.ignoreFirstLoad).toBe(true);
    expect(p.resolvesOnce).toBe(true);
    expect(p.onceKey).toBe("k");
    expect(p.ttlSeconds).toBe(10);
  });

  it("once(false) switches once off again", () => {
    expect(d(once(() => 1).once(false)).resolvesOnce).toBe(false);
  });
});

describe("scroll descriptors", () => {
  it("scroll(fn, { metadata }) defaults the wrapper to data", () => {
    const p = d(scroll(() => ({ data: [] }), { metadata: meta }));
    expect(p.kind).toBe("scroll");
    expect(p.isScroll).toBe(true);
    expect(p.merges).toBe(true);
    expect(p.wrapper).toBe("data");
    expect(p.defers).toBe(false);
    expect(p.ignoreFirstLoad).toBe(false);
  });

  it("scroll honours a custom wrapper and defer()", () => {
    const p = d(scroll(() => ({ items: [] }), { wrapper: "items", metadata: meta }).defer("feed"));
    expect(p.wrapper).toBe("items");
    expect(p.defers).toBe(true);
    expect(p.group).toBe("feed");
  });

  it("metadataFor returns the object or calls the function", () => {
    expect(d(scroll(() => ({ data: [] }), { metadata: meta })).metadataFor({ data: [] })).toEqual(meta);
    const fn = scroll(() => ({ data: [], next: 3 }), {
      metadata: (v: { next: number }) => ({ ...meta, nextPage: v.next }),
    });
    expect(d(fn).metadataFor({ data: [], next: 3 })).toEqual({ ...meta, nextPage: 3 });
  });

  it("scroll without metadata throws a TypeError", () => {
    expect(() => scroll(() => ({ data: [] }), {} as never)).toThrow(TypeError);
  });
});

describe("always and sources", () => {
  it("always(value) is flagged always and resolves a plain value", async () => {
    const p = d(always(42));
    expect(p.kind).toBe("always");
    expect(p.isAlways).toBe(true);
    await expect(p.resolveSource()).resolves.toBe(42);
  });

  it("resolveSource calls and awaits a function source", async () => {
    await expect(d(always(async () => 1)).resolveSource()).resolves.toBe(1);
    await expect(d(merge(() => [1])).resolveSource()).resolves.toEqual([1]);
  });

  it("callable-only constructors reject a non-function source", () => {
    expect(() => optional(1 as never)).toThrow(TypeError);
    expect(() => defer(1 as never)).toThrow(TypeError);
    expect(() => once(1 as never)).toThrow(TypeError);
    expect(() => scroll(1 as never, { metadata: meta })).toThrow(TypeError);
  });
});

describe("isPropDescriptor", () => {
  it("is true only for descriptors", () => {
    expect(isPropDescriptor(merge({}))).toBe(true);
    expect(isPropDescriptor(optional(() => 1))).toBe(true);
    expect(isPropDescriptor({})).toBe(false);
    expect(isPropDescriptor(() => 1)).toBe(false);
    expect(isPropDescriptor(null)).toBe(false);
  });
});
