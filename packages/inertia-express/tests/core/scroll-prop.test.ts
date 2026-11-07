/**
 * Port of inertia-laravel tests/ScrollPropTest.php. Skipped:
 * - test_resolves_meta_data (paginator inference): no paginator class; metadata is explicit here.
 * - test_scroll_prop_value_is_resolved_only_once: the reference caches the value on the prop because
 *   metadata() re-invokes it; here metadataFor() receives the resolved value, and a per-descriptor cache
 *   would serve stale data to later requests when a descriptor is hoisted to module level.
 * - Laravel `User::query()->paginate(15)` fixtures become `{ data: [...] }` objects with explicit metadata.
 */
import { describe, expect, it } from "vitest";
import type PropDescriptor from "../../src/core/prop-descriptor.js";
import { resolveProps } from "../../src/core/props-resolver.js";
import { scroll } from "../../src/core/props.js";
import { makeRequest, partialRequest } from "./support/request.js";

const d = (p: unknown): PropDescriptor => p as PropDescriptor;
const meta = { pageName: "page", previousPage: null, nextPage: 2, currentPage: 1 };
const users = { data: Array.from({ length: 15 }, (_, i) => ({ id: i + 1 })) };

const page = (props: Record<string, unknown>, request = makeRequest()) =>
  resolveProps({ shared: {}, props, component: "Users/Index", request });

describe("ScrollProp", () => {
  it("resolves custom meta data", () => {
    const custom = { pageName: "usersPage", previousPage: 10, nextPage: 12, currentPage: 11 };
    expect(d(scroll(() => users, { metadata: () => custom })).metadataFor(users)).toEqual(custom);
  });

  it("resolves meta data with callable provider receiving the value", () => {
    const p = scroll(() => ({ data: [], cursor: "abc" }), {
      metadata: (v: { cursor: string }) => ({ pageName: "callablePage", previousPage: 5, nextPage: v.cursor, currentPage: 6 }),
    });
    expect(d(p).metadataFor({ data: [], cursor: "abc" })).toEqual({
      pageName: "callablePage",
      previousPage: 5,
      nextPage: "abc",
      currentPage: 6,
    });
  });

  it("can set the merge intent based on the merge intent header", async () => {
    const append = await page({ users: scroll(() => users, { metadata: meta }) });
    expect(append.metadata.mergeProps).toEqual(["users.data"]);
    expect(append.metadata.prependProps).toBeUndefined();

    const appendHeader = await page({ users: scroll(() => users, { metadata: meta }) }, makeRequest({ mergeIntent: "append" }));
    expect(appendHeader.metadata.mergeProps).toEqual(["users.data"]);

    const prepend = await page({ users: scroll(() => users, { metadata: meta }) }, makeRequest({ mergeIntent: "prepend" }));
    expect(prepend.metadata.prependProps).toEqual(["users.data"]);
    expect(prepend.metadata.mergeProps).toBeUndefined();

    const custom = await page(
      { users: scroll(() => ({ items: [] }), { wrapper: "items", metadata: meta }) },
      makeRequest({ mergeIntent: "prepend" }),
    );
    expect(custom.metadata.prependProps).toEqual(["users.items"]);
    expect(custom.metadata.mergeProps).toBeUndefined();
  });

  it("a scroll descriptor reused across requests is reconfigured each time", async () => {
    const p = scroll(() => users, { metadata: meta });
    await page({ users: p }, makeRequest({ mergeIntent: "prepend" }));
    const second = await page({ users: p }, makeRequest({ mergeIntent: "append" }));
    expect(second.metadata.mergeProps).toEqual(["users.data"]);
    expect(second.metadata.prependProps).toBeUndefined();
  });

  it("scroll prop value is resolved fresh on every request", async () => {
    let callCount = 0;
    const p = scroll(() => {
      callCount += 1;
      return { data: [callCount] };
    }, { metadata: meta });
    const first = await page({ users: p });
    const second = await page({ users: p });
    expect(callCount).toBe(2);
    expect(first.props).toEqual({ users: { data: [1] } });
    expect(second.props).toEqual({ users: { data: [2] } });
  });

  it("deferred scroll prop is excluded from initial request", async () => {
    const r = await page({ users: scroll(() => users, { metadata: meta }).defer() });
    expect(r.props).toEqual({});
    expect(r.metadata.deferredProps).toEqual({ default: ["users"] });
    expect(r.metadata.scrollProps).toBeUndefined();
  });

  it("deferred scroll prop is resolved on partial request", async () => {
    const r = await page(
      { users: scroll(() => users, { metadata: meta }).defer() },
      partialRequest("Users/Index", { only: ["users"] }),
    );
    expect((r.props.users as typeof users).data).toHaveLength(15);
    expect(r.metadata.scrollProps).toEqual({ users: { ...meta, reset: false } });
    expect(r.metadata.mergeProps).toContain("users.data");
    expect(r.metadata.deferredProps).toBeUndefined();
  });

  it("deferred scroll prop can have custom group", async () => {
    const r = await page({ users: scroll(() => users, { metadata: meta }).defer("custom-group") });
    expect(r.props).toEqual({});
    expect(r.metadata.deferredProps).toEqual({ "custom-group": ["users"] });
  });

  it("matchOn is emitted under the full path", async () => {
    const r = await page({ users: scroll(() => users, { metadata: meta }).matchOn("id") });
    expect(r.metadata.matchPropsOn).toEqual(["users.id"]);
  });

  it("throws when the resolved value lacks the wrapper key", async () => {
    await expect(page({ users: scroll(() => ({ items: [] }), { metadata: meta }) })).rejects.toThrow(TypeError);
    await expect(page({ users: scroll(() => ({ items: [] }), { metadata: meta }) })).rejects.toThrow(/users/);
  });

  it("prepend intent emits prependProps and no mergeProps", async () => {
    const r = await page(
      { users: scroll(() => ({ data: [1] }), { metadata: meta }) },
      partialRequest("Users/Index", { only: ["users"], mergeIntent: "prepend" }),
    );
    expect(r.metadata.prependProps).toEqual(["users.data"]);
    expect(r.metadata.mergeProps).toBeUndefined();
    expect(r.metadata.scrollProps).toEqual({ users: { ...meta, reset: false } });
  });
});
