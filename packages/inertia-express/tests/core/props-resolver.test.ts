/**
 * Port of inertia-laravel tests/PropsResolverTest.php (v3.7.0-1-ge68dadf).
 * Case names mirror the reference so the two files diff side by side.
 *
 * Skipped reference cases and why:
 * - test_nested_provides_inertia_properties_* (4 cases), test_rescued_defer_prop_is_omitted_when_provides_inertia_property_throws:
 *   Laravel property providers (ProvidesInertiaProperties / ProvidesInertiaProperty) are a non-goal.
 * - test_it_descends_into_json_serializable_props, test_prop_types_nested_in_json_serializable_props_are_resolved:
 *   JsonSerializable coercion is a non-goal; JSON.stringify honours toJSON already.
 * - test_big_integers_*, test_self_referencing_objects_do_not_recurse_forever, test_an_object_shared_by_two_props_is_wrapped_in_both,
 *   test_internal_objects_keep_the_shape_json_encode_gives_them, test_pure_enums_are_left_for_json_encode_to_reject:
 *   preserveBigIntegers is a non-goal.
 * - test_recorder_is_*_while_resolving_props_* (2 cases): devtools recorder is a non-goal.
 * - test_arrays_matching_callable_syntax_are_not_invoked: PHP callable-array syntax has no JS equivalent.
 */
import { describe, expect, it, vi } from "vitest";
import PropDescriptor from "../../src/core/prop-descriptor.js";
import { resolveProps } from "../../src/core/props-resolver.js";
import { always, defer, merge, once, optional, scroll } from "../../src/core/props.js";
import { makeRequest, partialRequest } from "./support/request.js";

const COMPONENT = "TestComponent";

const page = (props: Record<string, unknown>, request = makeRequest(), shared: Record<string, unknown> = {}) =>
  resolveProps({ shared, props, component: COMPONENT, request });

const partial = (only: string, except?: string) =>
  partialRequest(COMPONENT, { only: only.split(","), except: except?.split(",") });

describe("closures", () => {
  it("nested closure is resolved", async () => {
    const r = await page({ auth: () => ({ user: "Jonathan" }) });
    expect(r.props).toEqual({ auth: { user: "Jonathan" } });
  });

  it("nested closure inside array is resolved", async () => {
    const r = await page({ auth: { user: () => "Jonathan" } });
    expect(r.props).toEqual({ auth: { user: "Jonathan" } });
  });

  it("nested always prop is resolved", async () => {
    const r = await page({ auth: { user: always(() => "Jonathan") } });
    expect(r.props).toEqual({ auth: { user: "Jonathan" } });
  });
});

describe("initial load exclusion", () => {
  it("nested optional prop is excluded from initial load", async () => {
    let resolved = false;
    const r = await page({
      auth: {
        user: "Jonathan",
        permissions: optional(() => {
          resolved = true;
          return ["admin"];
        }),
      },
    });
    expect(r.props).toEqual({ auth: { user: "Jonathan" } });
    expect(resolved).toBe(false);
  });

  it("nested defer prop is excluded from initial load", async () => {
    let resolved = false;
    const r = await page({
      auth: {
        user: "Jonathan",
        notifications: defer(() => {
          resolved = true;
          return [];
        }),
      },
    });
    expect(r.props).toEqual({ auth: { user: "Jonathan" } });
    expect(resolved).toBe(false);
  });

  it("excluded props are not resolved on initial load", async () => {
    let optionalResolved = false;
    let deferResolved = false;
    const r = await page({
      name: "Jonathan",
      permissions: optional(() => {
        optionalResolved = true;
        return ["admin"];
      }),
      notifications: defer(() => {
        deferResolved = true;
        return ["You have a new follower"];
      }),
    });
    expect(r.props).toEqual({ name: "Jonathan" });
    expect(optionalResolved).toBe(false);
    expect(deferResolved).toBe(false);
  });

  it("closure returning optional prop is excluded from initial load", async () => {
    let resolved = false;
    const r = await page({
      auth: () => ({
        user: "Jonathan",
        permissions: optional(() => {
          resolved = true;
          return ["admin"];
        }),
      }),
    });
    expect(r.props).toEqual({ auth: { user: "Jonathan" } });
    expect(resolved).toBe(false);
  });

  it("closure returning defer prop is excluded from initial load", async () => {
    let resolved = false;
    const r = await page({
      auth: () => ({
        user: "Jonathan",
        notifications: defer(() => {
          resolved = true;
          return [];
        }),
      }),
    });
    expect(r.props).toEqual({ auth: { user: "Jonathan" } });
    expect(resolved).toBe(false);
  });

  it("nested props on non partial inertia request behave like initial load", async () => {
    const r = await page(
      {
        dashboard: {
          stats: "visible",
          feed: merge([{ id: 1 }]),
          notifications: defer(() => []),
          settings: optional(() => []),
        },
      },
      makeRequest({ isInertia: true }),
    );
    expect(r.props).toEqual({ dashboard: { stats: "visible", feed: [{ id: 1 }] } });
    expect(r.metadata.deferredProps).toEqual({ default: ["dashboard.notifications"] });
  });

  it("deeply nested defer prop is excluded with metadata", async () => {
    const r = await page({ app: { auth: { notifications: defer(() => [], "alerts") } } });
    expect(r.props).toEqual({ app: { auth: {} } });
    expect(r.metadata.deferredProps).toEqual({ alerts: ["app.auth.notifications"] });
  });

  it("deferred props at mixed depths collect correct metadata", async () => {
    const r = await page({ foo: defer(() => "bar"), nested: { a: "b", c: defer(() => "d") } });
    expect(r.props).toEqual({ nested: { a: "b" } });
    expect(r.metadata.deferredProps).toEqual({ default: ["foo", "nested.c"] });
  });

  it("optional props inside indexed arrays are excluded from initial load", async () => {
    let resolved = false;
    const r = await page({
      foos: [
        {
          name: "First",
          bar: optional(() => {
            resolved = true;
            return "expensive-data";
          }),
        },
      ],
    });
    expect(r.props).toEqual({ foos: [{ name: "First" }] });
    expect(resolved).toBe(false);
  });

  it("deferred props inside closure are excluded from initial load", async () => {
    let notificationsResolved = false;
    let rolesResolved = false;
    const r = await page({
      auth: () => ({
        user: { name: "Jonathan Reinink", email: "jonathan@example.com" },
        notifications: defer(() => {
          notificationsResolved = true;
          return ["You have a new follower"];
        }),
        roles: defer(() => {
          rolesResolved = true;
          return ["admin"];
        }),
      }),
    });
    expect(r.props).toEqual({ auth: { user: { name: "Jonathan Reinink", email: "jonathan@example.com" } } });
    expect(r.metadata.deferredProps).toEqual({ default: ["auth.notifications", "auth.roles"] });
    expect(notificationsResolved).toBe(false);
    expect(rolesResolved).toBe(false);
  });
});

describe("partial requests", () => {
  it("nested optional prop is included on partial request", async () => {
    const r = await page({ auth: { user: "Jonathan", permissions: optional(() => ["admin"]) } }, partial("auth.permissions"));
    expect(r.props).toEqual({ auth: { permissions: ["admin"] } });
  });

  it("nested defer prop is included on partial request", async () => {
    const r = await page(
      { auth: { user: "Jonathan", notifications: defer(() => ["new message"]) } },
      partial("auth.notifications"),
    );
    expect(r.props).toEqual({ auth: { notifications: ["new message"] } });
    expect(r.metadata.deferredProps).toBeUndefined();
  });

  it("nested always prop is included on partial request", async () => {
    const r = await page(
      { auth: { user: "Jonathan", errors: always(() => ({ name: "required" })) } },
      partial("auth.user"),
    );
    expect(r.props).toEqual({ auth: { user: "Jonathan", errors: { name: "required" } } });
  });

  it("top level always prop is included when not requested", async () => {
    const r = await page({ other: "value", errors: always(() => ({ name: "required" })) }, partial("other"));
    expect(r.props).toEqual({ other: "value", errors: { name: "required" } });
  });

  it("nested prop is excluded via except header", async () => {
    const r = await page({ auth: { user: "Jonathan", token: "secret" } }, partial("auth", "auth.token"));
    expect(r.props).toEqual({ auth: { user: "Jonathan" } });
  });

  it("deeply nested optional prop is included on partial request", async () => {
    const r = await page({ app: { auth: { permissions: optional(() => ["admin"]) } } }, partial("app.auth.permissions"));
    expect(r.props).toEqual({ app: { auth: { permissions: ["admin"] } } });
  });

  it("deferred props at mixed depths resolve on partial request", async () => {
    const r = await page({ foo: defer(() => "bar"), nested: { a: "b", c: defer(() => "d") } }, partial("foo,nested.c"));
    expect(r.props).toEqual({ foo: "bar", nested: { c: "d" } });
    expect(r.metadata.deferredProps).toBeUndefined();
  });

  it("optional props inside indexed arrays are resolved on partial request", async () => {
    const r = await page(
      {
        foos: [
          { name: "First", bar: optional(() => "expensive-data-1") },
          { name: "Second", bar: optional(() => "expensive-data-2") },
        ],
      },
      partial("foos"),
    );
    expect(r.props).toEqual({
      foos: [
        { name: "First", bar: "expensive-data-1" },
        { name: "Second", bar: "expensive-data-2" },
      ],
    });
  });

  it("deferred props inside closure are resolved on partial request", async () => {
    const r = await page(
      {
        auth: () => ({
          user: { name: "Jonathan Reinink", email: "jonathan@example.com" },
          notifications: defer(() => ["You have a new follower"]),
          roles: defer(() => ["admin"]),
        }),
      },
      partial("auth.notifications,auth.roles"),
    );
    expect(r.props.auth).toMatchObject({ notifications: ["You have a new follower"], roles: ["admin"] });
  });

  it("includes the whole object when a closure child path is requested", async () => {
    const r = await page({ users: () => ({ data: [1], meta: { page: 1 } }) }, partial("users.data"));
    expect(r.props).toEqual({ users: { data: [1], meta: { page: 1 } } });
  });

  it("walks numeric-string keys on plain objects by name", async () => {
    const r = await page({ m: { "0": optional(() => "x"), a: 1 } }, partial("m.0"));
    expect(r.props).toEqual({ m: { "0": "x" } });
  });

  it("does not evaluate a bare closure excluded by a partial reload", async () => {
    let calls = 0;
    const r = await page(
      {
        wanted: 1,
        expensive: () => {
          calls += 1;
          return "nope";
        },
      },
      partial("wanted"),
    );
    expect(calls).toBe(0);
    expect(r.props).toEqual({ wanted: 1 });
  });

  it("treats a partial header for another component as a full visit", async () => {
    const r = await page({ a: 1, b: optional(() => 2) }, partialRequest("Other", { only: ["b"] }));
    expect(r.props).toEqual({ a: 1 });
  });
});

describe("dot notation", () => {
  it("dot notation optional prop is excluded from initial load", async () => {
    const r = await page({
      auth: { user: { name: "Jonathan Reinink", email: "jonathan@example.com" } },
      "auth.user.permissions": optional(() => ["edit-posts", "delete-posts"]),
    });
    expect(r.props).toEqual({ auth: { user: { name: "Jonathan Reinink", email: "jonathan@example.com" } } });
  });

  it("dot notation optional prop is included on partial request", async () => {
    const r = await page(
      {
        auth: { user: { name: "Jonathan Reinink", email: "jonathan@example.com" } },
        "auth.user.permissions": optional(() => ["edit-posts", "delete-posts"]),
      },
      partial("auth.user.permissions"),
    );
    expect(r.props).toEqual({ auth: { user: { permissions: ["edit-posts", "delete-posts"] } } });
  });
});

describe("deferred metadata", () => {
  it("nested defer prop metadata is collected", async () => {
    const r = await page({ auth: { user: "Jonathan", notifications: defer(() => []) } });
    expect(r.metadata.deferredProps).toEqual({ default: ["auth.notifications"] });
  });

  it("nested defer prop metadata preserves group", async () => {
    const r = await page({
      auth: { notifications: defer(() => [], "sidebar"), messages: defer(() => [], "sidebar") },
    });
    expect(r.metadata.deferredProps).toEqual({ sidebar: ["auth.notifications", "auth.messages"] });
  });

  it("closure returning defer prop metadata is collected", async () => {
    const r = await page({ auth: () => ({ user: "Jonathan", notifications: defer(() => [], "alerts") }) });
    expect(r.metadata.deferredProps).toEqual({ alerts: ["auth.notifications"] });
  });

  it("a closure returning a descriptor directly is unwrapped and re-excluded on initial load", async () => {
    let calls = 0;
    const r = await page({
      perms: () =>
        optional(() => {
          calls += 1;
          return ["admin"];
        }),
      feed: () => defer(() => [], "g"),
    });
    expect(r.props).toEqual({});
    expect(calls).toBe(0);
    expect(r.metadata.deferredProps).toEqual({ g: ["feed"] });
  });

  it("a closure returning a descriptor directly resolves it on a partial", async () => {
    const r = await page({ perms: () => optional(() => ["admin"]), feed: () => defer(() => [1], "g") }, partial("perms,feed"));
    expect(r.props).toEqual({ perms: ["admin"], feed: [1] });
    expect(r.metadata.deferredProps).toBeUndefined();
  });
});

describe("shared props and value passthrough", () => {
  it("lists shared top-level keys and lets page props win", async () => {
    const r = await page({ user: 2 }, makeRequest(), { app: "x", user: 1 });
    expect(r.props).toEqual({ app: "x", user: 2 });
    expect(r.metadata.sharedProps).toEqual(["app", "user"]);
  });

  it("resolves a descriptor placed in shared props", async () => {
    const r = await page({}, makeRequest(), { perms: optional(() => ["a"]), flag: always(true) });
    expect(r.props).toEqual({ flag: true });
    expect(r.metadata.sharedProps).toEqual(["perms", "flag"]);
  });

  it("passes non-plain objects through without recursing", async () => {
    const when = new Date(0);
    const map = new Map([["k", 1]]);
    class Box {
      v = optional(() => 1);
    }
    const box = new Box();
    const r = await page({ when, map, box, nil: null, list: [1, "a", null] });
    expect(r.props.when).toBe(when);
    expect(r.props.map).toBe(map);
    expect(r.props.box).toBe(box);
    expect((r.props.box as Box).v).toBeInstanceOf(PropDescriptor);
    expect(r.props.nil).toBeNull();
    expect(r.props.list).toEqual([1, "a", null]);
  });

  it("emits no metadata keys when nothing was collected", async () => {
    const r = await page({ a: 1 });
    expect(r.metadata).toEqual({});
  });

  it("resolves siblings in insertion order", async () => {
    const order: string[] = [];
    const r = await page({
      b: async () => {
        order.push("b");
        return 1;
      },
      a: async () => {
        order.push("a");
        return 2;
      },
    });
    expect(order).toEqual(["b", "a"]);
    expect(Object.keys(r.props)).toEqual(["b", "a"]);
  });
});

describe("merge metadata", () => {
  it("nested merge prop is resolved", async () => {
    const r = await page({ feed: { posts: merge([{ id: 1 }]) } });
    expect(r.props).toEqual({ feed: { posts: [{ id: 1 }] } });
  });

  it("closure returning merge prop resolves with metadata", async () => {
    const r = await page({ posts: () => merge([{ id: 1 }]) });
    expect(r.props).toEqual({ posts: [{ id: 1 }] });
    expect(r.metadata.mergeProps).toEqual(["posts"]);
  });

  it("closure returning defer prop collects deferred and merge metadata", async () => {
    const r = await page({ posts: () => defer(() => [{ id: 1 }]).merge() });
    expect(r.props).toEqual({});
    expect(r.metadata.deferredProps).toEqual({ default: ["posts"] });
    expect(r.metadata.mergeProps).toEqual(["posts"]);
  });

  it("nested merge prop is included on partial request", async () => {
    const r = await page({ feed: { posts: merge([{ id: 1 }]) } }, partial("feed.posts"));
    expect(r.props).toEqual({ feed: { posts: [{ id: 1 }] } });
  });

  it("nested merge prop metadata is collected", async () => {
    const r = await page({ feed: { posts: merge([{ id: 1 }]) } });
    expect(r.metadata.mergeProps).toEqual(["feed.posts"]);
  });

  it("nested prepend merge prop metadata is collected", async () => {
    const r = await page({ feed: { posts: merge([{ id: 1 }]).prepend() } });
    expect(r.metadata.prependProps).toEqual(["feed.posts"]);
    expect(r.metadata.mergeProps).toBeUndefined();
  });

  it("nested deep merge prop metadata is collected", async () => {
    const r = await page({ settings: { preferences: merge({ theme: "dark" }).deepMerge() } });
    expect(r.metadata.deepMergeProps).toEqual(["settings.preferences"]);
    expect(r.metadata.mergeProps).toBeUndefined();
  });

  it("nested merge prop with nested path metadata is collected", async () => {
    const r = await page({ feed: { posts: merge({ data: [{ id: 1 }] }).append("data") } });
    expect(r.metadata.mergeProps).toEqual(["feed.posts.data"]);
  });

  it("nested merge prop with match on metadata is collected", async () => {
    const r = await page({ feed: { posts: merge([{ id: 1 }]).matchOn("id").deepMerge() } });
    expect(r.metadata.deepMergeProps).toEqual(["feed.posts"]);
    expect(r.metadata.matchPropsOn).toEqual(["feed.posts.id"]);
  });

  it("append path with match on emits both paths", async () => {
    const r = await page({ users: merge({ data: [] }).append("data", "id") });
    expect(r.metadata).toEqual({ mergeProps: ["users.data"], matchPropsOn: ["users.data.id"] });
  });

  it("append and prepend paths emit to their own lists", async () => {
    const r = await page({ chat: merge({ newer: [], older: [] }).append("newer").prepend("older") });
    expect(r.metadata).toEqual({ mergeProps: ["chat.newer"], prependProps: ["chat.older"] });
  });

  it("paths win over the root flag", async () => {
    const r = await page({ p: merge([1]).append("data").prepend(true) });
    expect(r.metadata).toEqual({ mergeProps: ["p.data"] });
  });

  it("deep wins over paths", async () => {
    const r = await page({ p: merge({ data: [] }).append("data").deepMerge() });
    expect(r.metadata).toEqual({ deepMergeProps: ["p"] });
  });

  it("matchOn is emitted with a root append", async () => {
    const r = await page({ p: merge([]).matchOn("id") });
    expect(r.metadata).toEqual({ mergeProps: ["p"], matchPropsOn: ["p.id"] });
  });

  it("reset applies on a full visit and only to the named key", async () => {
    const r = await page({ a: merge([1]), b: merge([2]) }, makeRequest({ resetKeys: ["a"] }));
    expect(r.metadata).toEqual({ mergeProps: ["b"] });
  });

  it("nested defer with merge metadata is collected", async () => {
    const r = await page({ feed: { posts: defer(() => [{ id: 1 }]).merge() } });
    expect(r.metadata.deferredProps).toEqual({ default: ["feed.posts"] });
    expect(r.metadata.mergeProps).toEqual(["feed.posts"]);
  });

  it("nested merge metadata is collected on exact partial request", async () => {
    const r = await page({ feed: { posts: merge([{ id: 1 }]) } }, partial("feed.posts"));
    expect(r.props).toEqual({ feed: { posts: [{ id: 1 }] } });
    expect(r.metadata.mergeProps).toEqual(["feed.posts"]);
  });

  it("nested merge metadata is collected when parent is requested", async () => {
    const r = await page({ feed: { posts: merge([{ id: 1 }]) } }, partial("feed"));
    expect(r.props).toEqual({ feed: { posts: [{ id: 1 }] } });
    expect(r.metadata.mergeProps).toEqual(["feed.posts"]);
  });

  it("nested merge prop metadata is suppressed by reset header", async () => {
    const r = await page(
      { feed: { posts: merge([{ id: 1 }]) } },
      partialRequest(COMPONENT, { only: ["feed.posts"], reset: ["feed.posts"] }),
    );
    expect(r.props).toEqual({ feed: { posts: [{ id: 1 }] } });
    expect(r.metadata.mergeProps).toBeUndefined();
  });

  it("except header suppresses nested merge metadata", async () => {
    const r = await page(
      { feed: { posts: merge([{ id: 1 }]), comments: merge([{ id: 2 }]) } },
      partial("feed.posts,feed.comments", "feed.posts"),
    );
    expect(r.props).toEqual({ feed: { comments: [{ id: 2 }] } });
    expect(r.metadata.mergeProps).toEqual(["feed.comments"]);
  });

  it("except header for parent suppresses all nested metadata", async () => {
    const r = await page({ feed: { posts: merge([{ id: 1 }]) }, other: "value" }, partial("feed,other", "feed"));
    expect(r.props).toEqual({ other: "value" });
    expect(r.metadata.mergeProps).toBeUndefined();
  });

  it("deeply nested merge prop metadata uses full path", async () => {
    const r = await page({ app: { feed: { posts: merge([{ id: 1 }]) } } });
    expect(r.metadata.mergeProps).toEqual(["app.feed.posts"]);
  });

  it("nested props on non partial inertia request emit merge metadata", async () => {
    const r = await page(
      { dashboard: { stats: "visible", feed: merge([{ id: 1 }]), notifications: defer(() => []) } },
      makeRequest({ isInertia: true }),
    );
    expect(r.metadata.mergeProps).toEqual(["dashboard.feed"]);
    expect(r.metadata.deferredProps).toEqual({ default: ["dashboard.notifications"] });
  });

  it("a merge prop requested only by its child path is included without merge metadata", async () => {
    const r = await page({ users: merge({ data: [1] }).append("data") }, partial("users.data"));
    expect(r.props).toEqual({ users: { data: [1] } });
    expect(r.metadata.mergeProps).toBeUndefined();
  });
});

describe("once props", () => {
  const onceMeta = (prop: string) => ({ prop, expiresAt: null });

  it("nested once prop is resolved on initial load", async () => {
    const r = await page({ config: { locale: once(() => "en") } });
    expect(r.props).toEqual({ config: { locale: "en" } });
  });

  it("closure returning once prop resolves with metadata", async () => {
    const r = await page({ locale: () => once(() => "en") });
    expect(r.props).toEqual({ locale: "en" });
    expect(r.metadata.onceProps).toEqual({ locale: onceMeta("locale") });
  });

  it("nested once prop metadata is collected", async () => {
    const r = await page({ config: { locale: once(() => "en") } });
    expect(r.metadata.onceProps).toEqual({ "config.locale": onceMeta("config.locale") });
  });

  it("nested once prop with custom key metadata is collected", async () => {
    const r = await page({ config: { locale: once(() => "en").as("app-locale") } });
    expect(r.metadata.onceProps).toEqual({ "app-locale": onceMeta("config.locale") });
  });

  it("nested once prop is excluded when already loaded", async () => {
    let resolved = false;
    const r = await page(
      {
        config: {
          locale: once(() => {
            resolved = true;
            return "en";
          }),
          timezone: "UTC",
        },
      },
      makeRequest({ isInertia: true, exceptOnceProps: ["config.locale"] }),
    );
    expect(r.props).toEqual({ config: { timezone: "UTC" } });
    expect(r.metadata.onceProps).toEqual({ "config.locale": onceMeta("config.locale") });
    expect(resolved).toBe(false);
  });

  it("nested once metadata is collected on exact partial request", async () => {
    const r = await page({ config: { locale: once(() => "en") } }, partial("config.locale"));
    expect(r.props).toEqual({ config: { locale: "en" } });
    expect(r.metadata.onceProps).toEqual({ "config.locale": onceMeta("config.locale") });
  });

  it("nested once metadata is collected when parent is requested", async () => {
    const r = await page({ config: { locale: once(() => "en") } }, partial("config"));
    expect(r.props).toEqual({ config: { locale: "en" } });
    expect(r.metadata.onceProps).toEqual({ "config.locale": onceMeta("config.locale") });
  });

  it("once metadata is not collected for an unrequested path on a partial", async () => {
    const r = await page({ config: { locale: once(() => "en") }, other: always(1) }, partial("other"));
    expect(r.props).toEqual({ other: 1 });
    expect(r.metadata.onceProps).toBeUndefined();
  });

  it("nested defer once prop suppresses deferred metadata when already loaded", async () => {
    const r = await page({ feed: { posts: defer(() => []).once() } }, makeRequest({ exceptOnceProps: ["feed.posts"] }));
    expect(r.metadata.deferredProps).toBeUndefined();
    expect(r.metadata.onceProps).toEqual({ "feed.posts": onceMeta("feed.posts") });
  });

  it("nested defer once prop includes deferred metadata on first load", async () => {
    const r = await page({ feed: { posts: defer(() => []).once() } });
    expect(r.metadata.deferredProps).toEqual({ default: ["feed.posts"] });
    expect(r.metadata.onceProps).toEqual({ "feed.posts": onceMeta("feed.posts") });
  });

  it("a fresh once prop resolves even when the client already has it", async () => {
    const r = await page({ plans: once(() => ["a"]).fresh() }, makeRequest({ isInertia: true, exceptOnceProps: ["plans"] }));
    expect(r.props).toEqual({ plans: ["a"] });
    expect(r.metadata.onceProps).toEqual({ plans: onceMeta("plans") });
  });

  it("except-once is ignored on a non-Inertia request", async () => {
    const r = await page({ plans: once(() => ["a"]) }, makeRequest({ exceptOnceProps: ["plans"] }));
    expect(r.props).toEqual({ plans: ["a"] });
  });

  it("a closure returning an already-loaded once descriptor is excluded after unwrap", async () => {
    let calls = 0;
    const r = await page(
      {
        locale: () =>
          once(() => {
            calls += 1;
            return "en";
          }),
        other: 1,
      },
      makeRequest({ isInertia: true, exceptOnceProps: ["locale"] }),
    );
    expect(r.props).toEqual({ other: 1 });
    expect(calls).toBe(0);
    expect(r.metadata.onceProps).toEqual({ locale: onceMeta("locale") });
  });

  it("except-once is ignored on a partial reload", async () => {
    const r = await page({ plans: once(() => ["a"]) }, partialRequest(COMPONENT, { only: ["plans"], exceptOnce: ["plans"] }));
    expect(r.props).toEqual({ plans: ["a"] });
    expect(r.metadata.onceProps).toEqual({ plans: onceMeta("plans") });
  });

  it("a shared onceKey is last-write-wins", async () => {
    const r = await page({ a: once(() => 1).as("k"), b: once(() => 2).as("k") });
    expect(r.metadata.onceProps).toEqual({ k: onceMeta("b") });
  });

  it("partial request for parent resolves all nested prop types", async () => {
    const r = await page(
      {
        dashboard: {
          stats: "visible",
          feed: merge([{ id: 1 }]),
          notifications: defer(() => ["msg"]),
          settings: optional(() => ({ theme: "dark" })),
          locale: once(() => "en"),
        },
      },
      partial("dashboard"),
    );
    expect(r.props).toEqual({
      dashboard: { stats: "visible", feed: [{ id: 1 }], notifications: ["msg"], settings: { theme: "dark" }, locale: "en" },
    });
    expect(r.metadata.mergeProps).toEqual(["dashboard.feed"]);
    expect(r.metadata.onceProps).toEqual({ "dashboard.locale": onceMeta("dashboard.locale") });
    expect(r.metadata.deferredProps).toBeUndefined();
  });

  it("multiple nested prop types are handled together", async () => {
    const r = await page({
      dashboard: {
        stats: "visible",
        feed: merge([{ id: 1 }]),
        notifications: defer(() => []),
        settings: optional(() => []),
        locale: once(() => "en"),
      },
    });
    expect(r.props).toEqual({ dashboard: { stats: "visible", feed: [{ id: 1 }], locale: "en" } });
    expect(r.metadata.mergeProps).toEqual(["dashboard.feed"]);
    expect(r.metadata.deferredProps).toEqual({ default: ["dashboard.notifications"] });
    expect(r.metadata.onceProps).toEqual({ "dashboard.locale": onceMeta("dashboard.locale") });
  });
});

describe("scroll props", () => {
  const meta = { pageName: "page", previousPage: null, nextPage: 2, currentPage: 1 };
  const posts = () => scroll(() => ({ data: [{ id: 1 }] }), { metadata: meta });

  it("nested scroll prop metadata is collected", async () => {
    const r = await page({ feed: { posts: posts() } });
    expect(r.metadata.scrollProps).toEqual({ "feed.posts": { ...meta, reset: false } });
  });

  it("nested deferred scroll prop is excluded from initial load", async () => {
    const r = await page({ feed: { posts: posts().defer() } });
    expect(r.props).toEqual({ feed: {} });
    expect(r.metadata.deferredProps).toEqual({ default: ["feed.posts"] });
    expect(r.metadata.scrollProps).toBeUndefined();
  });

  it("a deferred scroll prop excluded on initial load still emits root merge metadata", async () => {
    const r = await page({ feed: { posts: posts().defer() } });
    expect(r.metadata).toEqual({ mergeProps: ["feed.posts"], deferredProps: { default: ["feed.posts"] } });
  });

  it("nested scroll prop is included on partial request", async () => {
    const r = await page({ feed: { posts: posts() } }, partial("feed.posts"));
    expect(r.props).toEqual({ feed: { posts: { data: [{ id: 1 }] } } });
    expect(r.metadata.scrollProps).toEqual({ "feed.posts": { ...meta, reset: false } });
    expect(r.metadata.mergeProps).toEqual(["feed.posts.data"]);
  });

  it("nested scroll prop reset flag is set by reset header", async () => {
    const r = await page({ feed: { posts: posts() } }, makeRequest({ resetKeys: ["feed.posts"] }));
    expect(r.metadata.scrollProps?.["feed.posts"]!.reset).toBe(true);
    expect(r.metadata.mergeProps).toBeUndefined();
  });
});

describe("rescue", () => {
  it("rescued defer prop is omitted and metadata on partial request", async () => {
    const r = await page(
      {
        auth: {
          notifications: defer(() => {
            throw new Error("Rescue this deferred prop");
          }).rescue(),
        },
      },
      partial("auth.notifications"),
    );
    expect(r.props).toEqual({ auth: {} });
    expect(r.metadata.rescuedProps).toEqual(["auth.notifications"]);
  });

  it("propagates an error from a prop without rescue", async () => {
    const boom = new Error("db down");
    await expect(
      page({
        a: () => {
          throw boom;
        },
      }),
    ).rejects.toBe(boom);
  });

  it("propagates a rejection from an unrescued defer on a partial", async () => {
    const boom = new Error("async down");
    await expect(page({ a: defer(async () => Promise.reject(boom)) }, partial("a"))).rejects.toBe(boom);
  });

  it("reports a rescued error with the path and omits the prop", async () => {
    const seen: [unknown, string][] = [];
    const r = await resolveProps({
      shared: {},
      props: {
        users: {
          list: defer(async () => {
            throw new Error("x");
          }).rescue(),
        },
      },
      component: COMPONENT,
      request: partial("users.list"),
      onRescue: (e, p) => seen.push([e, p]),
    });
    expect(r.props).toEqual({ users: {} });
    expect(r.metadata.rescuedProps).toEqual(["users.list"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]![1]).toBe("users.list");
    expect((seen[0]![0] as Error).message).toBe("x");
  });

  it("a closure returning a rescued defer prop is omitted too", async () => {
    const r = await page(
      {
        stats: () =>
          defer(() => {
            throw new Error("Failed to resolve stats");
          }).rescue(),
      },
      partial("stats"),
    );
    expect(r.props).toEqual({});
    expect(r.metadata.rescuedProps).toEqual(["stats"]);
  });

  it("rescue does not emit merge metadata for the omitted prop", async () => {
    const r = await page(
      {
        posts: defer(() => {
          throw new Error("no");
        })
          .merge()
          .rescue(),
      },
      partial("posts"),
    );
    expect(r.metadata).toEqual({ rescuedProps: ["posts"] });
  });

  it("defaults onRescue to console.error and names the path", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await page(
        {
          a: defer(() => {
            throw new Error("logged");
          }).rescue(),
        },
        partial("a"),
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]!.some((arg) => typeof arg === "string" && arg.includes("a"))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("reports a non-Error throw as-is", async () => {
    const seen: unknown[] = [];
    const r = await resolveProps({
      shared: {},
      props: {
        s: defer(() => {
          throw "plain";
        }).rescue(),
        u: defer(async () => Promise.reject(undefined)).rescue(),
      },
      component: COMPONENT,
      request: partial("s,u"),
      onRescue: (e) => seen.push(e),
    });
    expect(r.props).toEqual({});
    expect(seen).toEqual(["plain", undefined]);
    expect(r.metadata.rescuedProps).toEqual(["s", "u"]);
  });

  it("lists rescued paths in walk order across nesting", async () => {
    const r = await page(
      {
        b: { y: defer(() => Promise.reject(new Error("1"))).rescue() },
        a: defer(() => Promise.reject(new Error("2"))).rescue(),
      },
      partialRequest(COMPONENT, { only: ["b.y", "a"] }),
    );
    expect(r.metadata.rescuedProps).toEqual(["b.y", "a"]);
  });
});

describe("descriptors are read-only during resolution", () => {
  const meta = { pageName: "page", previousPage: null, nextPage: 2, currentPage: 1 };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const snapshot = (p: unknown) => JSON.stringify({ ...(p as object) });

  it("two concurrent requests on one scroll descriptor each get their own merge intent", async () => {
    const users = scroll(async () => {
      await sleep(20);
      return { data: [1] };
    }, { metadata: meta });
    const [a, b] = await Promise.all([
      page({ users }, makeRequest({ mergeIntent: "append" })),
      page({ users }, makeRequest({ mergeIntent: "prepend" })),
    ]);
    expect(a.metadata.mergeProps).toEqual(["users.data"]);
    expect(a.metadata.prependProps).toBeUndefined();
    expect(b.metadata.prependProps).toEqual(["users.data"]);
    expect(b.metadata.mergeProps).toBeUndefined();
  });

  it("a partial for a deferred scroll is not disturbed by a concurrent initial load", async () => {
    const du = scroll(async () => {
      await sleep(20);
      return { data: [1] };
    }, { metadata: meta }).defer();
    const [partialResult, initial] = await Promise.all([
      page({ du }, partial("du")),
      sleep(5).then(() => page({ du })),
    ]);
    expect(partialResult.metadata.mergeProps).toEqual(["du.data"]);
    expect(initial.metadata).toEqual({ mergeProps: ["du"], deferredProps: { default: ["du"] } });
  });

  it("leaves every descriptor field unchanged after resolve", async () => {
    const s = scroll(() => ({ data: [] }), { metadata: meta }).matchOn("id");
    const d = defer(() => 1).merge().append("x");
    const o = once(() => 1).as("k");
    const before = [snapshot(s), snapshot(d), snapshot(o)];
    await page({ s, d, o }, makeRequest({ mergeIntent: "prepend" }));
    await page({ s, d, o }, partial("s,d,o"));
    expect([snapshot(s), snapshot(d), snapshot(o)]).toEqual(before);
  });

  it("resolves independent siblings concurrently while keeping insertion order", async () => {
    const started: string[] = [];
    const slow = (name: string) => async () => {
      started.push(name);
      await sleep(30);
      return name;
    };
    const t0 = Date.now();
    const r = await page({ b: slow("b"), a: slow("a"), c: slow("c") });
    expect(Date.now() - t0).toBeLessThan(75);
    expect(started).toEqual(["b", "a", "c"]);
    expect(Object.keys(r.props)).toEqual(["b", "a", "c"]);
  });

  it("walks a 10k-row list well under a second", async () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({ id: i, name: `n${i}`, a: 1, b: 2, c: [i] }));
    const t0 = Date.now();
    const r = await page({ rows });
    expect(Date.now() - t0).toBeLessThan(250);
    expect((r.props.rows as unknown[]).length).toBe(10_000);
  });
});

describe("onRescue containment", () => {
  it("a throwing onRescue hook is logged and the prop is still rescued", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await resolveProps({
        shared: {},
        props: {
          a: defer(() => {
            throw new Error("inner");
          }).rescue(),
          b: 1,
        },
        component: COMPONENT,
        request: partial("a,b"),
        onRescue: () => {
          throw new Error("hook broke");
        },
      });
      expect(r.props).toEqual({ b: 1 });
      expect(r.metadata.rescuedProps).toEqual(["a"]);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("a rejecting async onRescue hook is logged, not left unhandled", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const listener = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", listener);
    try {
      const r = await resolveProps({
        shared: {},
        props: {
          a: defer(() => {
            throw new Error("inner");
          }).rescue(),
        },
        component: COMPONENT,
        request: partial("a"),
        onRescue: (async () => {
          throw new Error("async hook broke");
        }) as unknown as () => void,
      });
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(r.metadata.rescuedProps).toEqual(["a"]);
      expect(unhandled).toEqual([]);
      expect(spy).toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", listener);
      spy.mockRestore();
    }
  });
});

describe("metadata maps are own-key safe", () => {
  it("accepts __proto__ as a defer group and a once key", async () => {
    const r = await page({ a: defer(() => 1, "__proto__"), b: once(() => 2).as("__proto__") });
    expect(Object.hasOwn(r.metadata.deferredProps ?? {}, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(r.metadata.deferredProps, "__proto__")?.value).toEqual(["a"]);
    expect(Object.getOwnPropertyDescriptor(r.metadata.onceProps, "__proto__")?.value).toEqual({ prop: "b", expiresAt: null });
  });
});
