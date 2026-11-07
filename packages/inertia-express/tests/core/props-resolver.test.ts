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
import { describe, expect, it } from "vitest";
import PropDescriptor from "../../src/core/prop-descriptor.js";
import { resolveProps } from "../../src/core/props-resolver.js";
import { always, defer, merge, optional } from "../../src/core/props.js";
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
