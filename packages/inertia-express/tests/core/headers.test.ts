import { describe, expect, it } from "vitest";
import { parseInertiaRequest } from "../../src/core/headers.js";

describe("parseInertiaRequest", () => {
  it("detects Inertia requests via x-inertia: true", () => {
    const info = parseInertiaRequest({
      headers: { "x-inertia": "true" },
      method: "GET",
      url: "/users",
    });
    expect(info.isInertia).toBe(true);
    expect(info.method).toBe("GET");
    expect(info.url).toBe("/users");
  });

  it("treats missing x-inertia as a non-Inertia request", () => {
    const info = parseInertiaRequest({
      headers: {},
      method: "GET",
      url: "/",
    });
    expect(info.isInertia).toBe(false);
  });

  it("parses partial reload headers as comma-separated lists", () => {
    const info = parseInertiaRequest({
      headers: {
        "x-inertia": "true",
        "x-inertia-partial-component": "Users/Index",
        "x-inertia-partial-data": " a , b,c",
        "x-inertia-partial-except": "secret,internal",
      },
      method: "GET",
      url: "/users",
    });
    expect(info.partialComponent).toBe("Users/Index");
    expect(info.partialOnly).toEqual(["a", "b", "c"]);
    expect(info.partialExcept).toEqual(["secret", "internal"]);
  });

  it("normalizes method to uppercase", () => {
    const info = parseInertiaRequest({
      headers: {},
      method: "post",
      url: "/x",
    });
    expect(info.method).toBe("POST");
  });

  it("returns null for empty list headers", () => {
    const info = parseInertiaRequest({
      headers: { "x-inertia-partial-data": "  " },
      method: "GET",
      url: "/",
    });
    expect(info.partialOnly).toBeNull();
  });

  it("reads the first value when a header arrives as an array", () => {
    const info = parseInertiaRequest({
      headers: {
        "x-inertia": ["true", "true"],
        "x-inertia-version": ["v9"],
      },
      method: "GET",
      url: "/",
    });
    expect(info.isInertia).toBe(true);
    expect(info.version).toBe("v9");
  });

  it("treats an empty array header as missing", () => {
    const info = parseInertiaRequest({
      headers: { "x-inertia-version": [] },
      method: "GET",
      url: "/",
    });
    expect(info.version).toBeNull();
  });

  it("accepts x-inertia: '1' as truthy", () => {
    const info = parseInertiaRequest({
      headers: { "x-inertia": "1" },
      method: "GET",
      url: "/",
    });
    expect(info.isInertia).toBe(true);
  });

  it("parses reset keys and error bag", () => {
    const info = parseInertiaRequest({
      headers: {
        "x-inertia-reset": "a, b",
        "x-inertia-error-bag": "user",
      },
      method: "GET",
      url: "/",
    });
    expect(info.resetKeys).toEqual(["a", "b"]);
    expect(info.errorBag).toBe("user");
  });
});
