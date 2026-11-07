/**
 * Port of inertia-laravel tests/AlwaysPropTest.php. Skipped:
 * - test_can_resolve_bindings_when_invoked: Laravel container injection has no equivalent.
 * - test_can_accept_callables (invokable object): any JS function is callable; covered by "can invoke".
 */
import { describe, expect, it } from "vitest";
import type PropDescriptor from "../../src/core/prop-descriptor.js";
import { always } from "../../src/core/props.js";

const d = (p: unknown): PropDescriptor => p as PropDescriptor;

describe("AlwaysProp", () => {
  it("can invoke", async () => {
    await expect(d(always(() => "An always value")).resolveSource()).resolves.toBe("An always value");
  });

  it("can accept scalar values", async () => {
    await expect(d(always("An always value")).resolveSource()).resolves.toBe("An always value");
  });

  it("string function names are not invoked", async () => {
    await expect(d(always("date")).resolveSource()).resolves.toBe("date");
  });
});
