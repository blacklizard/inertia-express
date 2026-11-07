/**
 * Port of inertia-laravel tests/OncePropTest.php. Skipped:
 * - test_can_resolve_bindings_when_invoked: Laravel container injection has no equivalent.
 * - enum cases inside test_can_set_custom_key: PHP enums; keys are strings here.
 * Resolution-level once behaviour (except-once, ttl) lives in props-resolver.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type PropDescriptor from "../../src/core/prop-descriptor.js";
import { resolveProps } from "../../src/core/props-resolver.js";
import { once } from "../../src/core/props.js";
import { makeRequest } from "./support/request.js";

const d = (p: unknown): PropDescriptor => p as PropDescriptor;

afterEach(() => {
  vi.useRealTimers();
});

describe("OnceProp", () => {
  it("can invoke with a callback", async () => {
    await expect(d(once(() => "A once prop value")).resolveSource()).resolves.toBe("A once prop value");
  });

  it("can set custom key", () => {
    const p = once(() => "value");
    expect(p.as("custom-key")).toBe(p);
    expect(d(p).onceKey).toBe("custom-key");
  });

  it("should not be refreshed by default", () => {
    expect(d(once(() => "value")).isFresh).toBe(false);
  });

  it("can forcefully refresh", () => {
    expect(d(once(() => "value").fresh()).isFresh).toBe(true);
  });

  it("can disable forceful refresh", () => {
    expect(d(once(() => "value").fresh().fresh(false)).isFresh).toBe(false);
  });

  it("until(seconds) sets expiresAt in epoch milliseconds from now", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    const r = await resolveProps({
      shared: {},
      props: { plans: once(() => ["a"]).until(60) },
      component: "C",
      request: makeRequest(),
    });
    expect(r.metadata.onceProps).toEqual({ plans: { prop: "plans", expiresAt: 1_700_000_060_000 } });
  });

  it("until(Date) uses that date", async () => {
    const r = await resolveProps({
      shared: {},
      props: { plans: once(() => ["a"]).until(new Date(1_800_000_000_000)) },
      component: "C",
      request: makeRequest(),
    });
    expect(r.metadata.onceProps).toEqual({ plans: { prop: "plans", expiresAt: 1_800_000_000_000 } });
  });

  it("a shared once prop with a custom key is excluded when the client has that key", async () => {
    const r = await resolveProps({
      shared: { plans: once(() => ["a"]).as("plans-v1") },
      props: { user: 1 },
      component: "C",
      request: makeRequest({ isInertia: true, exceptOnceProps: ["plans-v1"] }),
    });
    expect(r.props).toEqual({ user: 1 });
    expect(r.metadata.onceProps).toEqual({ "plans-v1": { prop: "plans", expiresAt: null } });
    expect(r.metadata.sharedProps).toEqual(["plans"]);
  });
});
