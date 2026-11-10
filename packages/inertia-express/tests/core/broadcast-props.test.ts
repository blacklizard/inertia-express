/**
 * Port of inertia-laravel tests/BroadcastPropsTest.php.
 *
 * Skipped reference cases and why:
 * - a json resource value / an arrayable value resolves: Laravel value coercions (spec section 2 non-goals).
 * - a numerically keyed property provider contributes its own keys: ProvidesInertiaProperties is a non-goal.
 * - the authors own sibling keys in broadcast with are untouched: event broadcastWith() has no equivalent.
 * - both DevTools cases: no DevTools integration.
 * - a closure value resolves: the container-injected request half is dropped; the closure case is kept without a request.
 * - a once prop the requesting client already has is still broadcast, partial reload headers do not filter the payload:
 *   they take a request; the helpers take none (Decision 1), so both collapse into "a once prop is still broadcast".
 */
import { describe, expect, it, vi } from "vitest";

import {
  always, broadcastProps, defer, live, once, optional, resolveBroadcastProps,
} from "../../src/core/index.js";

describe("broadcastProps", () => {
  it("returns the inertia props envelope and nothing else", async () => {
    const payload = await broadcastProps({ order: { id: 1 } });
    expect(Object.keys(payload)).toEqual(["__inertia"]);
    expect(Object.keys(payload.__inertia)).toEqual(["props"]);
    expect(payload.__inertia.props).toEqual({ order: { id: 1 } });
  });

  it("a closure value resolves", async () => {
    expect((await broadcastProps({ path: () => "orders/1" })).__inertia.props.path).toBe("orders/1");
  });

  it("every prop named in the payload is resolved", async () => {
    expect((await broadcastProps({
      order: { id: 1 }, deferred: defer(() => "deferred-value"), optional: optional(() => "optional-value"),
    })).__inertia.props).toEqual({ order: { id: 1 }, deferred: "deferred-value", optional: "optional-value" });
  });

  it("a rescued prop is left out of the payload", async () => {
    const payload = await broadcastProps({
      order: { id: 1 },
      stats: defer(() => { throw new Error("Rescue this broadcast prop"); }).rescue(),
    }, () => {});
    expect(payload.__inertia.props).toEqual({ order: { id: 1 } });
  });

  it("a rescued prop returned from a closure is left out of the payload", async () => {
    const payload = await broadcastProps({
      order: { id: 1 },
      stats: () => defer(() => { throw new Error("Rescue this broadcast prop"); }).rescue(),
    }, () => {});
    expect(payload.__inertia.props).toEqual({ order: { id: 1 } });
  });

  it("a once prop is still broadcast", async () => {
    expect((await broadcastProps({ settings: once(() => ({ theme: "dark" })) })).__inertia.props.settings)
      .toEqual({ theme: "dark" });
  });

  it("an always broadcast prop still resolves", async () => {
    expect((await broadcastProps({ always: always("always-value") })).__inertia.props.always).toBe("always-value");
  });

  it("dot path keys stay flat and literal", async () => {
    const props = (await broadcastProps({ "order.total": 125 })).__inertia.props;
    expect(props).toEqual({ "order.total": 125 });
    expect(props).not.toHaveProperty("order");
  });

  it("multiple props resolve in one call", async () => {
    expect((await broadcastProps({ order: { id: 1 }, status: "paid" })).__inertia.props)
      .toEqual({ order: { id: 1 }, status: "paid" });
  });

  it("a live prop resolves to its value", async () => {
    expect((await broadcastProps({
      order: live(() => ({ id: 1 }), { on: "OrderUpdated", channel: "orders" }),
    })).__inertia.props).toEqual({ order: { id: 1 } });
  });

  it("reports a rescued error through onRescue with its path", async () => {
    const onRescue = vi.fn();
    const error = new Error("boom");
    await broadcastProps({ nested: { stats: defer(() => { throw error; }).rescue() } }, onRescue);
    expect(onRescue).toHaveBeenCalledWith(error, "nested.stats");
  });

  it("nested closures resolve and nested dotted keys stay literal", async () => {
    expect(await resolveBroadcastProps({ a: { "b.c": 1, d: () => 2 } })).toEqual({ a: { "b.c": 1, d: 2 } });
  });

  it("keeps insertion order and propagates unrescued errors", async () => {
    const out = await resolveBroadcastProps({
      slow: async () => { await new Promise((r) => { setTimeout(r, 10); }); return 1; },
      fast: () => 2,
    });
    expect(Object.keys(out)).toEqual(["slow", "fast"]);
    await expect(resolveBroadcastProps({ bad: () => { throw new Error("x"); } })).rejects.toThrow("x");
  });
});
