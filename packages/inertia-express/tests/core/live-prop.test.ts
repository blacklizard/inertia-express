/**
 * Port of inertia-laravel tests/LivePropTest.php. Node has no event or channel
 * classes: events are strings and channels are given explicitly (spec §5).
 * Skipped, Laravel-only:
 * - can resolve bindings when invoked: container injection.
 * - the event class name is used as the event name; the broadcast as name is used as the event name;
 *   can listen for an event class name; an event class name resolves its own broadcast name;
 *   an event class name whose broadcast name comes from the payload throws; an enum broadcast name
 *   resolves to its value; an event class name that does not exist throws; an event name without a
 *   namespace is left untouched; an event class name resolves its own channels; an event class name
 *   that builds its channels from the payload throws; an event class name with an untyped payload
 *   throws; channels keyed by connection are read for the default connection; channels keyed by
 *   connection without the default connection throw; an event without channels throws; an event
 *   that broadcasts on no channels throws; broadcast on can mix bare strings and channel objects;
 *   broadcast on can return a broadcastable model; the given channel wins over the channels the
 *   event broadcasts on: event classes and broadcastOn().
 */
import { describe, expect, it } from "vitest";
import type PropDescriptorType from "../../src/core/prop-descriptor.js";
import { always, defer, isPropDescriptor, live, once, optional, scroll } from "../../src/core/props.js";

type PropDescriptor = PropDescriptorType;

const ORDERS_1 = { name: "orders.1", type: "private" } as const;
const d = (prop: unknown): PropDescriptor => prop as PropDescriptor;

describe("LiveProp", () => {
  it("can invoke with a value", async () => {
    expect(await d(live("A live prop value", { on: "OrderUpdated", channel: ORDERS_1 })).resolveSource()).toBe("A live prop value");
  });
  it("can invoke with a callback", async () => {
    expect(await d(live(() => "A live prop value", { on: "OrderUpdated", channel: ORDERS_1 })).resolveSource()).toBe("A live prop value");
  });
  it("string function names are not invoked", async () => {
    expect(await d(live("date", { on: "OrderUpdated", channel: ORDERS_1 })).resolveSource()).toBe("date");
  });
  it("the factory creates a live prop", () => {
    const prop = live("bar", { on: "OrderUpdated", channel: ORDERS_1 });
    expect(isPropDescriptor(prop)).toBe(true);
    expect(d(prop).kind).toBe("live");
    expect(d(prop).isLive).toBe(true);
  });
  it("props are not live by default", () => {
    for (const prop of [always("bar"), optional(() => "bar"), once(() => "bar"), defer(() => "bar")]) {
      expect(d(prop).isLive).toBe(false);
    }
  });
  it("supported prop types can be marked as live", () => {
    for (const prop of [always("bar"), optional(() => "bar"), once(() => "bar"), defer(() => "bar")]) {
      const result = prop.live({ on: "OrderUpdated", channel: ORDERS_1 });
      expect(result).toBe(prop);
      expect(d(prop).liveListeners()).toEqual([{ channel: ORDERS_1, events: ["OrderUpdated"] }]);
    }
  });
  it("a merge prop cannot be made live", () => {
    expect(() => d(defer(() => "bar").merge()).live({ on: "OrderUpdated", channel: ORDERS_1 })).toThrow("Live updates are not supported on merge properties.");
  });
  it("a live prop cannot be made mergeable", () => {
    expect(() => defer(() => "bar").live({ on: "OrderUpdated", channel: ORDERS_1 }).merge()).toThrow("Live updates are not supported on merge properties.");
  });
  it("a deep merge prop cannot be made live", () => {
    expect(() => d(defer(() => "bar").deepMerge()).live({ on: "OrderUpdated", channel: ORDERS_1 })).toThrow("Live updates are not supported on merge properties.");
  });
  it("a scroll prop cannot be made live", () => {
    const prop = d(scroll(() => ({ data: [] }), { metadata: { pageName: "page", previousPage: null, nextPage: null, currentPage: 1 } }));
    expect(() => prop.live({ on: "OrderUpdated", channel: ORDERS_1 })).toThrow("Live updates are not supported on merge properties.");
  });
  it("a live prop may still configure how it would merge", () => {
    const prop = d(defer(() => "bar").live({ on: "OrderUpdated", channel: ORDERS_1 }).append("items"));
    expect(prop.isLive).toBe(true);
    expect(prop.merges).toBe(false);
  });
  it("can listen for multiple events", () => {
    expect(d(live("bar", { on: ["OrderUpdated", "OrderShipped"], channel: ORDERS_1 })).liveListeners())
      .toEqual([{ channel: ORDERS_1, events: ["OrderUpdated", "OrderShipped"] }]);
  });
  it("events on different channels keep their own listener pairs", () => {
    const prop = d(live("bar", { on: "OrderUpdated", channel: ORDERS_1 }).live({ on: "UserUpdated", channel: { name: "users.7", type: "private" } }));
    expect(prop.liveListeners()).toEqual([
      { channel: ORDERS_1, events: ["OrderUpdated"] },
      { channel: { name: "users.7", type: "private" }, events: ["UserUpdated"] },
    ]);
  });
  it("events on the same channel collapse into one listener", () => {
    const prop = d(live("bar", { on: "OrderUpdated", channel: ORDERS_1 }).live({ on: "OrderPaid", channel: ORDERS_1 }));
    expect(prop.liveListeners()).toEqual([{ channel: ORDERS_1, events: ["OrderUpdated", "OrderPaid"] }]);
  });
  it("one event broadcasting on several channels gets one listener per channel", () => {
    const prop = d(live("bar", { on: "OrderShipped", channel: ["stats", { name: "room.1", type: "presence" }] }));
    expect(prop.liveListeners()).toEqual([
      { channel: { name: "stats", type: "public" }, events: ["OrderShipped"] },
      { channel: { name: "room.1", type: "presence" }, events: ["OrderShipped"] },
    ]);
  });
  it("explicit channels pair every event with every channel", () => {
    const prop = d(live("bar", { on: ["OrderUpdated", "UserUpdated"], channel: ["orders.1", "stats"] }));
    expect(prop.liveListeners()).toEqual([
      { channel: { name: "orders.1", type: "public" }, events: ["OrderUpdated", "UserUpdated"] },
      { channel: { name: "stats", type: "public" }, events: ["OrderUpdated", "UserUpdated"] },
    ]);
  });
  it("duplicate events and channels are removed", () => {
    const prop = d(live("bar", { on: ["OrderUpdated", "OrderUpdated"], channel: [ORDERS_1, ORDERS_1] }));
    expect(prop.liveListeners()).toEqual([{ channel: ORDERS_1, events: ["OrderUpdated"] }]);
  });
  it("the channel type is resolved from the channel", () => {
    for (const type of ["public", "private", "presence", "encrypted-private"] as const) {
      expect(d(live("bar", { on: "OrderUpdated", channel: { name: "orders.1", type } })).liveListeners())
        .toEqual([{ channel: { name: "orders.1", type }, events: ["OrderUpdated"] }]);
    }
  });
  it("the channel prefix is never broadcast", () => {
    const cases = [["private-orders.1", "private"], ["presence-orders.1", "presence"], ["private-encrypted-orders.1", "encrypted-private"]] as const;
    for (const [name, type] of cases) {
      expect(d(live("bar", { on: "OrderUpdated", channel: { name, type } })).liveListeners()[0]?.channel).toEqual({ name: "orders.1", type });
    }
  });
  it("a public channel keeps a name that looks prefixed", () => {
    expect(d(live("bar", { on: "OrderUpdated", channel: { name: "private-orders.1", type: "public" } })).liveListeners()[0]?.channel)
      .toEqual({ name: "private-orders.1", type: "public" });
  });
  it("a bare string channel is public wherever it is given", () => {
    expect(d(live("bar", { on: "OrderUpdated", channel: "orders" })).liveListeners()[0]?.channel).toEqual({ name: "orders", type: "public" });
    expect(d(live("bar", { on: "OrderUpdated", channel: ["orders"] })).liveListeners()[0]?.channel).toEqual({ name: "orders", type: "public" });
  });
  it("can subscribe to multiple channels", () => {
    expect(d(live("bar", { on: "OrderUpdated", channel: ["orders.1", "stats"] })).liveListeners()).toEqual([
      { channel: { name: "orders.1", type: "public" }, events: ["OrderUpdated"] },
      { channel: { name: "stats", type: "public" }, events: ["OrderUpdated"] },
    ]);
  });
  it("a broadcast name without a channel throws", () => {
    const prop = d(live("bar", { on: "order.updated", channel: [] }));
    expect(() => prop.liveListeners()).toThrow("Unable to resolve the channels for the [order.updated] event. Pass the [channel] option.");
  });
  it("a live prop without events throws", () => {
    const prop = d(live("bar", { on: [], channel: "orders" }));
    expect(() => prop.liveListeners()).toThrow("A live property must listen for at least one event.");
  });
  it("the throttle is null by default", () => {
    expect(d(live("bar", { on: "OrderUpdated", channel: ORDERS_1 })).liveThrottle).toBeNull();
  });
  it("can set the throttle", () => {
    expect(d(live("bar", { on: "OrderUpdated", channel: ORDERS_1, throttle: 5000 })).liveThrottle).toBe(5000);
  });
  it("live can be called more than once", () => {
    const prop = d(live("bar", { on: "OrderUpdated", channel: ORDERS_1 }).live({ on: "OrderShipped", channel: "stats" }));
    expect(prop.liveListeners()).toEqual([
      { channel: ORDERS_1, events: ["OrderUpdated"] },
      { channel: { name: "stats", type: "public" }, events: ["OrderShipped"] },
    ]);
  });
  it("an explicit channel does not leak into a later declaration", () => {
    const prop = d(live("bar", { on: "OrderUpdated", channel: "orders.1" }).live({ on: "OrderShipped", channel: { name: "room.1", type: "presence" } }));
    expect(prop.liveListeners()).toEqual([
      { channel: { name: "orders.1", type: "public" }, events: ["OrderUpdated"] },
      { channel: { name: "room.1", type: "presence" }, events: ["OrderShipped"] },
    ]);
  });
  it("a later explicit channel does not leak into an earlier declaration", () => {
    const prop = d(live("bar", { on: "OrderUpdated", channel: ORDERS_1 }).live({ on: "OrderShipped", channel: "stats" }));
    expect(prop.liveListeners()[0]).toEqual({ channel: ORDERS_1, events: ["OrderUpdated"] });
  });
  it("a channel declared without an event contributes nothing", () => {
    const prop = d(live("bar", { on: "OrderUpdated", channel: ORDERS_1 }).live({ on: [], channel: "ignored" }));
    expect(prop.liveListeners()).toEqual([{ channel: ORDERS_1, events: ["OrderUpdated"] }]);
  });
  it("a later throttle replaces an earlier one and a declaration without one keeps it", () => {
    const prop = d(live("bar", { on: "A", channel: "x", throttle: 100 }).live({ on: "B", channel: "y" }));
    expect(prop.liveThrottle).toBe(100);
    prop.live({ on: "C", channel: "z", throttle: 250 });
    expect(prop.liveThrottle).toBe(250);
  });
  it("an unknown channel type throws when declared", () => {
    expect(() => live("bar", { on: "A", channel: { name: "x", type: "secret" as never } })).toThrow(TypeError);
    expect(() => live("bar", { on: "A", channel: { name: "x", type: "secret" as never } })).toThrow("Unknown live channel type [secret]. Use public, private, presence or encrypted-private.");
  });
});
