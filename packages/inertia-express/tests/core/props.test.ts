import { describe, expect, it } from "vitest";
import type { InertiaRequestInfo } from "../../src/core/index.js";
import { always, deepMerge, defer, lazy, merge, optional, resolveProps } from "../../src/core/index.js";

const baseRequest: InertiaRequestInfo = {
  isInertia: false,
  version: null,
  partialComponent: null,
  partialOnly: null,
  partialExcept: null,
  errorBag: null,
  resetKeys: null,
  method: "GET",
  url: "/x",
};

describe("resolveProps", () => {
  it("merges shared and page props with page winning", async () => {
    const result = await resolveProps({
      shared: { a: 1, b: 2 },
      props: { b: 99, c: 3 },
      component: "X",
      request: baseRequest,
    });
    expect(result.props).toEqual({ a: 1, b: 99, c: 3 });
  });

  it("evaluates lazy props on every visit", async () => {
    const result = await resolveProps({
      shared: {},
      props: { count: lazy(() => 42) },
      component: "X",
      request: baseRequest,
    });
    expect(result.props.count).toBe(42);
  });

  it("omits optional props on full visits", async () => {
    const result = await resolveProps({
      shared: {},
      props: { heavy: optional(() => "expensive") },
      component: "X",
      request: baseRequest,
    });
    expect(result.props.heavy).toBeUndefined();
  });

  it("includes optional props when partial-data names them", async () => {
    const result = await resolveProps({
      shared: {},
      props: { heavy: optional(() => "x") },
      component: "Users/Index",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "Users/Index",
        partialOnly: ["heavy"],
      },
    });
    expect(result.props.heavy).toBe("x");
  });

  it("omits deferred props on initial visits and lists keys by group", async () => {
    const result = await resolveProps({
      shared: {},
      props: {
        stats: defer(() => "stats", "dashboard"),
        users: defer(() => "users", "dashboard"),
        misc: defer(() => "misc"),
      },
      component: "X",
      request: baseRequest,
    });
    expect(result.props.stats).toBeUndefined();
    expect(result.deferred).toEqual({
      dashboard: ["stats", "users"],
      default: ["misc"],
    });
  });

  it("evaluates deferred props on partial reloads", async () => {
    const result = await resolveProps({
      shared: {},
      props: { stats: defer(async () => 7) },
      component: "Dash",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "Dash",
        partialOnly: ["stats"],
      },
    });
    expect(result.props.stats).toBe(7);
    expect(result.deferred).toEqual({});
  });

  it("filters by partial-data on matching component only", async () => {
    const result = await resolveProps({
      shared: {},
      props: { a: 1, b: 2 },
      component: "Other",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "Different",
        partialOnly: ["a"],
      },
    });
    // Component mismatch => not a partial; include everything (non-deferred/optional).
    expect(result.props).toEqual({ a: 1, b: 2 });
  });

  it("excludes keys listed in partial-except", async () => {
    const result = await resolveProps({
      shared: {},
      props: { a: 1, b: 2, c: 3 },
      component: "X",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "X",
        partialExcept: ["b"],
      },
    });
    expect(result.props).toEqual({ a: 1, c: 3 });
  });

  it("partial-except takes precedence over partial-data", async () => {
    const result = await resolveProps({
      shared: {},
      props: { a: 1, b: 2, c: 3 },
      component: "X",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "X",
        partialOnly: ["a", "b"],
        partialExcept: ["b"],
      },
    });
    expect(result.props).toEqual({ a: 1 });
  });

  it("collects merge prop keys", async () => {
    const result = await resolveProps({
      shared: {},
      props: { items: merge([{ id: 1 }]) },
      component: "X",
      request: baseRequest,
    });
    expect(result.merge).toEqual(["items"]);
  });

  it("excludes reset keys from merge but keeps the fresh value", async () => {
    const result = await resolveProps({
      shared: {},
      props: { items: merge([{ id: 1 }]) },
      component: "X",
      request: { ...baseRequest, resetKeys: ["items"] },
    });
    expect(result.merge).toEqual([]);
    expect(result.props.items).toEqual([{ id: 1 }]);
  });

  it("keeps merge keys not listed in reset", async () => {
    const result = await resolveProps({
      shared: {},
      props: { items: merge([{ id: 1 }]) },
      component: "X",
      request: { ...baseRequest, resetKeys: ["other"] },
    });
    expect(result.merge).toEqual(["items"]);
  });

  it("evaluates always props on full visits", async () => {
    const result = await resolveProps({
      shared: {},
      props: { flash: always(() => "msg") },
      component: "X",
      request: baseRequest,
    });
    expect(result.props.flash).toBe("msg");
  });

  it("includes always props on partial reloads that do not name them", async () => {
    const result = await resolveProps({
      shared: {},
      props: { flash: always(() => "msg"), other: 1 },
      component: "X",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "X",
        partialOnly: ["other"],
      },
    });
    expect(result.props.flash).toBe("msg");
    expect(result.props.other).toBe(1);
  });

  it("includes always props even when partial-except names them", async () => {
    const result = await resolveProps({
      shared: {},
      props: { flash: always(() => "msg"), a: 1 },
      component: "X",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "X",
        partialExcept: ["flash"],
      },
    });
    expect(result.props.flash).toBe("msg");
    expect(result.props.a).toBe(1);
  });

  it("resets only the named merge key when several are present", async () => {
    const result = await resolveProps({
      shared: {},
      props: {
        posts: merge([{ id: 1 }]),
        comments: merge([{ id: 2 }]),
      },
      component: "X",
      request: { ...baseRequest, resetKeys: ["posts"] },
    });
    expect(result.merge).toEqual(["comments"]);
  });

  it("collects deep-merge prop keys separately from shallow merge", async () => {
    const result = await resolveProps({
      shared: {},
      props: {
        flat: merge([{ id: 1 }]),
        nested: deepMerge({ a: { b: 1 } }),
      },
      component: "X",
      request: baseRequest,
    });
    expect(result.merge).toEqual(["flat"]);
    expect(result.deepMerge).toEqual(["nested"]);
  });

  it("emits dotted matchOn paths for merge props", async () => {
    const result = await resolveProps({
      shared: {},
      props: { posts: merge([{ id: 1 }], "id") },
      component: "X",
      request: baseRequest,
    });
    expect(result.merge).toEqual(["posts"]);
    expect(result.matchOn).toEqual(["posts.id"]);
  });

  it("supports multiple matchOn fields on a deep-merge prop", async () => {
    const result = await resolveProps({
      shared: {},
      props: { rows: deepMerge([{ a: 1, b: 2 }], ["a", "b"]) },
      component: "X",
      request: baseRequest,
    });
    expect(result.deepMerge).toEqual(["rows"]);
    expect(result.matchOn).toEqual(["rows.a", "rows.b"]);
  });

  it("excludes reset keys from deepMerge and matchOn", async () => {
    const result = await resolveProps({
      shared: {},
      props: { rows: deepMerge([{ id: 1 }], "id") },
      component: "X",
      request: { ...baseRequest, resetKeys: ["rows"] },
    });
    expect(result.deepMerge).toEqual([]);
    expect(result.matchOn).toEqual([]);
    expect(result.props.rows).toEqual([{ id: 1 }]);
  });

  it("keeps a prop whose key is a prefix of a 3-level dotted partial pattern", async () => {
    const result = await resolveProps({
      shared: {},
      props: { user: { profile: { name: "Alice" } }, unrelated: 99 },
      component: "X",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "X",
        partialOnly: ["user.profile.name"],
      },
    });
    expect(result.props.user).toEqual({ profile: { name: "Alice" } });
    expect(result.props.unrelated).toBeUndefined();
  });

  it("keeps a prop whose key is 'a' when partial pattern is 'a.b.c'", async () => {
    const result = await resolveProps({
      shared: {},
      props: { a: { b: { c: "deep" } }, z: "excluded" },
      component: "X",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "X",
        partialOnly: ["a.b.c"],
      },
    });
    expect(result.props.a).toEqual({ b: { c: "deep" } });
    expect(result.props.z).toBeUndefined();
  });
});
