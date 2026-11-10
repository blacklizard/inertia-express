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
      preserveFragment: false,
    });
  });

  it("includes deferredProps only when non-empty", () => {
    expect(createPage(base).deferredProps).toBeUndefined();
    expect(createPage({ ...base, metadata: { deferredProps: {} } }).deferredProps).toBeUndefined();
    const p = createPage({ ...base, metadata: { deferredProps: { dash: ["s"] } } });
    expect(p.deferredProps).toEqual({ dash: ["s"] });
  });

  it("includes mergeProps only when non-empty", () => {
    expect(createPage(base).mergeProps).toBeUndefined();
    expect(createPage({ ...base, metadata: { mergeProps: [] } }).mergeProps).toBeUndefined();
    expect(createPage({ ...base, metadata: { mergeProps: ["items"] } }).mergeProps).toEqual(["items"]);
  });

  it("copies every non-empty metadata key and drops empty ones", () => {
    const p = createPage({
      ...base,
      metadata: {
        sharedProps: ["auth"],
        prependProps: ["chat.older"],
        deepMergeProps: [],
        matchPropsOn: ["chat.older.id"],
        rescuedProps: ["stats"],
        scrollProps: {},
        onceProps: { k: { prop: "k", expiresAt: null } },
      },
    });
    expect(p.sharedProps).toEqual(["auth"]);
    expect(p.prependProps).toEqual(["chat.older"]);
    expect(p.matchPropsOn).toEqual(["chat.older.id"]);
    expect(p.rescuedProps).toEqual(["stats"]);
    expect(p.onceProps).toEqual({ k: { prop: "k", expiresAt: null } });
    expect(p.deepMergeProps).toBeUndefined();
    expect(p.scrollProps).toBeUndefined();
    expect(p.preserveFragment).toBe(false);
  });

  it("emits scrollProps with the reset flag", () => {
    const meta = { pageName: "page", previousPage: null, nextPage: 2, currentPage: 1, reset: true };
    expect(createPage({ ...base, metadata: { scrollProps: { users: meta } } }).scrollProps).toEqual({ users: meta });
  });

  it("copies only known metadata keys", () => {
    const p = createPage({
      ...base,
      metadata: { mergeProps: ["a"], props: { hacked: true }, component: "Evil", url: "/evil" } as never,
    });
    expect(p.props).toEqual({ a: 1 });
    expect(p.component).toBe("X");
    expect(p.url).toBe("/x");
    expect(p.mergeProps).toEqual(["a"]);
  });

  it("forwards preserveFragment", () => {
    expect(createPage({ ...base, preserveFragment: true }).preserveFragment).toBe(true);
  });

  it("forwards clearHistory / encryptHistory flags", () => {
    const p = createPage({ ...base, clearHistory: true, encryptHistory: true });
    expect(p.clearHistory).toBe(true);
    expect(p.encryptHistory).toBe(true);
  });

  it("copies liveProps from metadata and drops it when empty", () => {
    const live = { order: { listeners: [{ channel: { name: "orders", type: "public" as const }, events: ["order.updated"] }] } };
    expect(createPage({ ...base, metadata: { liveProps: live } }).liveProps).toEqual(live);
    expect(createPage({ ...base, metadata: { liveProps: {} } })).not.toHaveProperty("liveProps");
  });
});
