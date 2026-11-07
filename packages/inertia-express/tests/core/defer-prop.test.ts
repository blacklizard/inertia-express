/**
 * Port of inertia-laravel tests/DeferPropTest.php. Skipped:
 * - test_can_resolve_bindings_when_invoked: Laravel container injection has no equivalent.
 * - test_string_function_names_are_not_invoked: defer() requires a function source here (TypeError otherwise).
 */
import { describe, expect, it } from "vitest";
import type PropDescriptor from "../../src/core/prop-descriptor.js";
import { defer } from "../../src/core/props.js";

const d = (p: unknown): PropDescriptor => p as PropDescriptor;

describe("DeferProp", () => {
  it("can invoke", async () => {
    const p = d(defer(() => "A deferred value", "default"));
    await expect(p.resolveSource()).resolves.toBe("A deferred value");
    expect(p.group).toBe("default");
  });

  it("can invoke and merge", async () => {
    await expect(d(defer(() => "A deferred value").merge()).resolveSource()).resolves.toBe("A deferred value");
  });

  it("is onceable", () => {
    const p = d(defer(() => "value").once(true, "custom-key", 60));
    expect(p.resolvesOnce).toBe(true);
    expect(p.onceKey).toBe("custom-key");
    expect(p.expiresAt()).not.toBeNull();
  });

  it("can be marked as rescuable", () => {
    expect(d(defer(() => "value").rescue()).rescues).toBe(true);
    expect(d(defer(() => "value")).rescues).toBe(false);
  });
});
