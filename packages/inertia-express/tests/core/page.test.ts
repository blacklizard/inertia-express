import { describe, expect, it } from "vitest";
import { createPage } from "../../src/core/page.js";

const base = {
  component: "X",
  props: { a: 1 },
  url: "/x",
  version: null,
};

describe("createPage", () => {
  it("emits the minimal v3 page shape with default flags", () => {
    const page = createPage(base);
    expect(page).toEqual({
      component: "X",
      props: { a: 1 },
      url: "/x",
      version: null,
      clearHistory: false,
      encryptHistory: false,
    });
  });

  it("includes deferredProps only when non-empty", () => {
    expect(createPage(base).deferredProps).toBeUndefined();
    expect(createPage({ ...base, deferredProps: {} }).deferredProps).toBeUndefined();
    const p = createPage({ ...base, deferredProps: { dash: ["s"] } });
    expect(p.deferredProps).toEqual({ dash: ["s"] });
  });

  it("includes mergeProps only when non-empty", () => {
    expect(createPage(base).mergeProps).toBeUndefined();
    expect(createPage({ ...base, mergeProps: [] }).mergeProps).toBeUndefined();
    expect(createPage({ ...base, mergeProps: ["items"] }).mergeProps).toEqual(["items"]);
  });

  it("forwards clearHistory / encryptHistory flags", () => {
    const p = createPage({ ...base, clearHistory: true, encryptHistory: true });
    expect(p.clearHistory).toBe(true);
    expect(p.encryptHistory).toBe(true);
  });
});
