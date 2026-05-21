import { describe, expect, it } from "vitest";
import type { InertiaRequestInfo } from "../../src/core/index.js";
import { deepMerge, defer, merge } from "../../src/core/index.js";
import { buildPage } from "../../src/core/render.js";

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

describe("buildPage", () => {
  it("merges shared props passed as a plain object (page wins)", async () => {
    const page = await buildPage({
      component: "X",
      props: { override: "page" },
      request: baseRequest,
      req: {},
      shared: { auth: { user: "alice" }, override: "shared" },
      version: "v1",
    });
    expect(page.props).toEqual({
      auth: { user: "alice" },
      override: "page",
    });
    expect(page.version).toBe("v1");
  });

  it("treats null/undefined shared as empty", async () => {
    const page = await buildPage({
      component: "X",
      props: { a: 1 },
      request: baseRequest,
      req: {},
      shared: undefined,
      version: null,
    });
    expect(page.props).toEqual({ a: 1 });
  });

  it("treats a shared function returning undefined as empty", async () => {
    const page = await buildPage({
      component: "X",
      props: { a: 1 },
      request: baseRequest,
      req: {},
      shared: () => undefined as never,
      version: null,
    });
    expect(page.props).toEqual({ a: 1 });
  });

  it("forwards clearHistory/encryptHistory options", async () => {
    const page = await buildPage({
      component: "X",
      props: {},
      request: baseRequest,
      req: {},
      shared: undefined,
      version: null,
      options: { clearHistory: true, encryptHistory: true },
    });
    expect(page.clearHistory).toBe(true);
    expect(page.encryptHistory).toBe(true);
  });

  it("forwards mergeProps from a merge() prop into the page object", async () => {
    const page = await buildPage({
      component: "Feed",
      props: { posts: merge([{ id: 1 }]) },
      request: baseRequest,
      req: {},
      shared: undefined,
      version: null,
    });
    expect(page.mergeProps).toEqual(["posts"]);
    expect(page.props.posts).toEqual([{ id: 1 }]);
  });

  it("forwards deferredProps map from a defer() prop into the page object", async () => {
    const page = await buildPage({
      component: "Dashboard",
      props: { stats: defer(() => "stats", "dashboard") },
      request: baseRequest,
      req: {},
      shared: undefined,
      version: null,
    });
    expect(page.deferredProps).toEqual({ dashboard: ["stats"] });
    expect(page.props.stats).toBeUndefined();
  });

  it("forwards deepMergeProps and matchPropsOn into the page object", async () => {
    const page = await buildPage({
      component: "Feed",
      props: { rows: deepMerge([{ id: 1 }], "id") },
      request: baseRequest,
      req: {},
      shared: undefined,
      version: null,
    });
    expect(page.deepMergeProps).toEqual(["rows"]);
    expect(page.matchPropsOn).toEqual(["rows.id"]);
    expect(page.mergeProps).toBeUndefined();
  });

  it("propagates rejection when shared async function rejects", async () => {
    const boom = async () => {
      throw new Error("shared exploded");
    };
    await expect(
      buildPage({
        component: "X",
        props: { a: 1 },
        request: baseRequest,
        req: {},
        shared: boom,
        version: null,
      }),
    ).rejects.toThrow("shared exploded");
  });

  it("treats a shared function returning null as empty", async () => {
    const page = await buildPage({
      component: "X",
      props: { a: 1 },
      request: baseRequest,
      req: {},
      shared: () => null as never,
      version: null,
    });
    expect(page.props).toEqual({ a: 1 });
  });
});
