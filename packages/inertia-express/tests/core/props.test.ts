import { describe, expect, it } from "vitest";
import type { InertiaRequestInfo } from "../../src/core/index.js";
import { resolveProps } from "../../src/core/index.js";

const baseRequest: InertiaRequestInfo = {
  isInertia: false,
  version: null,
  partialComponent: null,
  partialOnly: null,
  partialExcept: null,
  errorBag: null,
  resetKeys: null,
  exceptOnceProps: [],
  mergeIntent: "append",
  isPrefetch: false,
  method: "GET",
  url: "/x",
};

describe("bare closure props", () => {
  it("resolves an untagged function prop on a full visit (sync and async)", async () => {
    const result = await resolveProps({
      shared: {},
      props: { user: () => ({ id: 7 }), stats: async () => 42, plain: 1 },
      component: "X",
      request: baseRequest,
    });
    expect(result.props).toEqual({ user: { id: 7 }, stats: 42, plain: 1 });
  });

  it("does not evaluate a bare closure excluded by a partial reload", async () => {
    let calls = 0;
    const result = await resolveProps({
      shared: {},
      props: {
        wanted: 1,
        expensive: () => {
          calls += 1;
          return "nope";
        },
      },
      component: "X",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "X",
        partialOnly: ["wanted"],
      },
    });
    expect(calls).toBe(0);
    expect(result.props).toEqual({ wanted: 1 });
  });

  it("evaluates a bare closure included in a partial reload", async () => {
    const result = await resolveProps({
      shared: {},
      props: { expensive: () => "yes", other: 2 },
      component: "X",
      request: {
        ...baseRequest,
        isInertia: true,
        partialComponent: "X",
        partialOnly: ["expensive"],
      },
    });
    expect(result.props).toEqual({ expensive: "yes" });
  });
});
