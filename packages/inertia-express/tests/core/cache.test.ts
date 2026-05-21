import { describe, expect, it } from "vitest";
import { canonicalStringify, computeSsrCacheKey } from "../../src/core/cache.js";

describe("canonicalStringify", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalStringify({ b: 1, a: { d: 4, c: 3 } })).toBe(JSON.stringify({ a: { c: 3, d: 4 }, b: 1 }));
  });

  it("drops undefined values", () => {
    expect(canonicalStringify({ a: undefined, b: 1 })).toBe(JSON.stringify({ b: 1 }));
  });

  it("normalizes NaN/Infinity to null", () => {
    expect(canonicalStringify({ a: NaN, b: Infinity, c: 1 })).toBe(JSON.stringify({ a: null, b: null, c: 1 }));
  });

  it("preserves array order", () => {
    expect(canonicalStringify([3, 1, 2])).toBe(JSON.stringify([3, 1, 2]));
  });
});

describe("computeSsrCacheKey", () => {
  it("produces stable keys for equivalent props", () => {
    const a = computeSsrCacheKey({
      prefix: "ssr",
      version: "v1",
      component: "Home",
      props: { a: 1, b: 2 },
    });
    const b = computeSsrCacheKey({
      prefix: "ssr",
      version: "v1",
      component: "Home",
      props: { b: 2, a: 1 },
    });
    expect(a).toBe(b);
  });

  it("changes when version changes (deploy invalidation)", () => {
    const a = computeSsrCacheKey({
      prefix: "ssr",
      version: "v1",
      component: "Home",
      props: {},
    });
    const b = computeSsrCacheKey({
      prefix: "ssr",
      version: "v2",
      component: "Home",
      props: {},
    });
    expect(a).not.toBe(b);
  });

  it("includes the prefix and component in the key shape", () => {
    const key = computeSsrCacheKey({
      prefix: "x",
      version: "v",
      component: "Page",
      props: {},
    });
    expect(key.startsWith("x:v:Page:")).toBe(true);
  });

  it("treats null version as a literal namespace", () => {
    const key = computeSsrCacheKey({
      prefix: "x",
      version: null,
      component: "P",
      props: {},
    });
    expect(key.startsWith("x:_:P:")).toBe(true);
  });

  it("differentiates by discriminator", () => {
    const a = computeSsrCacheKey({
      prefix: "x",
      version: "v",
      component: "P",
      props: {},
      discriminator: "en",
    });
    const b = computeSsrCacheKey({
      prefix: "x",
      version: "v",
      component: "P",
      props: {},
      discriminator: "fr",
    });
    expect(a).not.toBe(b);
  });
});
