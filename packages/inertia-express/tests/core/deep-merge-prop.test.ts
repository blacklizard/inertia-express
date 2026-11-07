/**
 * Port of inertia-laravel tests/DeepMergePropTest.php. Skipped:
 * - test_can_resolve_bindings_when_invoked: Laravel container injection has no equivalent.
 */
import { describe, expect, it } from "vitest";
import type PropDescriptor from "../../src/core/prop-descriptor.js";
import { deepMerge, merge } from "../../src/core/props.js";

const d = (p: unknown): PropDescriptor => p as PropDescriptor;

describe("DeepMergeProp", () => {
  it("can invoke with a callback", async () => {
    await expect(d(deepMerge(() => "A merge prop value")).resolveSource()).resolves.toBe("A merge prop value");
  });

  it("can invoke with a non callback", async () => {
    await expect(d(deepMerge({ key: "value" })).resolveSource()).resolves.toEqual({ key: "value" });
  });

  it("merge().deepMerge() is the same as deepMerge()", () => {
    expect(d(merge({}).deepMerge()).deep).toBe(true);
    expect(d(deepMerge({})).deep).toBe(true);
  });

  it("can use single string as key to match on", () => {
    expect(d(merge({ key: "value" }).matchOn("key")).matchOnPaths).toEqual(["key"]);
  });

  it("can use an array of strings as keys to match on", () => {
    expect(d(merge({ key: "value" }).matchOn(["key", "anotherKey"])).matchOnPaths).toEqual(["key", "anotherKey"]);
  });
});
