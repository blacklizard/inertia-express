/**
 * Port of inertia-laravel tests/OptionalPropTest.php. Skipped:
 * - test_can_resolve_bindings_when_invoked: Laravel container injection has no equivalent.
 * - test_string_function_names_are_not_invoked: optional() requires a function source here (TypeError otherwise).
 */
import { describe, expect, it } from "vitest";
import type PropDescriptor from "../../src/core/prop-descriptor.js";
import { optional } from "../../src/core/props.js";

const d = (p: unknown): PropDescriptor => p as PropDescriptor;

describe("OptionalProp", () => {
  it("can invoke", async () => {
    await expect(d(optional(() => "An optional value")).resolveSource()).resolves.toBe("An optional value");
  });

  it("is onceable", () => {
    const p = d(optional(() => "value").once().as("custom-key").until(60));
    expect(p.resolvesOnce).toBe(true);
    expect(p.onceKey).toBe("custom-key");
    expect(p.expiresAt()).not.toBeNull();
  });
});
