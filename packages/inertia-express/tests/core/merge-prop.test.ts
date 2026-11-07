/**
 * Port of inertia-laravel tests/MergePropTest.php. Skipped:
 * - test_can_resolve_bindings_when_invoked: Laravel container injection has no equivalent.
 * - test_mix_of_append_and_prepend_with_nested_merge_paths_and_match_on_as_array uses PHP's
 *   mixed numeric/string array; ported as chained calls preserving order.
 */
import { describe, expect, it } from "vitest";
import type PropDescriptor from "../../src/core/prop-descriptor.js";
import { merge } from "../../src/core/props.js";

const d = (p: unknown): PropDescriptor => p as PropDescriptor;

describe("MergeProp", () => {
  it("can invoke with a callback", async () => {
    await expect(d(merge(() => "A merge prop value")).resolveSource()).resolves.toBe("A merge prop value");
  });

  it("can invoke with a non callback", async () => {
    await expect(d(merge({ key: "value" })).resolveSource()).resolves.toEqual({ key: "value" });
  });

  it("string function names are not invoked", async () => {
    await expect(d(merge("date")).resolveSource()).resolves.toBe("date");
  });

  it("appends by default", () => {
    const p = d(merge([]));
    expect(p.appendsAtRoot).toBe(true);
    expect(p.prependsAtRoot).toBe(false);
    expect(p.appendPaths).toEqual([]);
    expect(p.prependPaths).toEqual([]);
    expect(p.matchOnPaths).toEqual([]);
  });

  it("prepends", () => {
    const p = d(merge([]).prepend());
    expect(p.appendsAtRoot).toBe(false);
    expect(p.prependsAtRoot).toBe(true);
    expect(p.appendPaths).toEqual([]);
    expect(p.prependPaths).toEqual([]);
  });

  it("appends with nested merge paths", () => {
    const p = d(merge([]).append("data"));
    expect(p.appendsAtRoot).toBe(false);
    expect(p.prependsAtRoot).toBe(false);
    expect(p.appendPaths).toEqual(["data"]);
    expect(p.prependPaths).toEqual([]);
    expect(p.matchOnPaths).toEqual([]);
  });

  it("appends with nested merge paths and match on", () => {
    const p = d(merge([]).append("data", "id"));
    expect(p.appendPaths).toEqual(["data"]);
    expect(p.matchOnPaths).toEqual(["data.id"]);
  });

  it("prepends with nested merge paths", () => {
    const p = d(merge([]).prepend("data"));
    expect(p.appendsAtRoot).toBe(false);
    expect(p.prependsAtRoot).toBe(false);
    expect(p.prependPaths).toEqual(["data"]);
    expect(p.appendPaths).toEqual([]);
  });

  it("prepends with nested merge paths and match on", () => {
    const p = d(merge([]).prepend("data", "id"));
    expect(p.prependPaths).toEqual(["data"]);
    expect(p.matchOnPaths).toEqual(["data.id"]);
  });

  it("append with nested merge paths as array", () => {
    expect(d(merge([]).append(["data", "items"])).appendPaths).toEqual(["data", "items"]);
  });

  it("append with nested merge paths and match on as array", () => {
    const p = d(merge([]).append({ data: "id", items: "uid" }));
    expect(p.appendPaths).toEqual(["data", "items"]);
    expect(p.matchOnPaths).toEqual(["data.id", "items.uid"]);
  });

  it("prepend with nested merge paths as array", () => {
    expect(d(merge([]).prepend(["data", "items"])).prependPaths).toEqual(["data", "items"]);
  });

  it("prepend with nested merge paths and match on as array", () => {
    const p = d(merge([]).prepend({ data: "id", items: "uid" }));
    expect(p.prependPaths).toEqual(["data", "items"]);
    expect(p.matchOnPaths).toEqual(["data.id", "items.uid"]);
  });

  it("mix of append and prepend with nested merge paths and match on", () => {
    const p = d(
      merge([])
        .append("data")
        .append("users", "id")
        .append({ items: "uid" })
        .append("posts")
        .prepend("categories")
        .prepend("companies", "id")
        .prepend({ tags: "name" })
        .prepend("comments"),
    );
    expect(p.appendsAtRoot).toBe(false);
    expect(p.prependsAtRoot).toBe(false);
    expect(p.appendPaths).toEqual(["data", "users", "items", "posts"]);
    expect(p.prependPaths).toEqual(["categories", "companies", "tags", "comments"]);
    expect(p.matchOnPaths).toEqual(["users.id", "items.uid", "companies.id", "tags.name"]);
  });

  it("is onceable", () => {
    const p = d(merge(() => []).once().as("custom-key").until(60));
    expect(p.resolvesOnce).toBe(true);
    expect(p.onceKey).toBe("custom-key");
    expect(p.expiresAt()).not.toBeNull();
  });
});
