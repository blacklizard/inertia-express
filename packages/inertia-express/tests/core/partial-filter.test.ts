import { describe, expect, it } from "vitest";
import { leadsToOnly, matchesExcept, matchesOnly, pathIsSameOrDescendant } from "../../src/core/partial-filter.js";

describe("pathIsSameOrDescendant", () => {
  it("matches the same path and dotted descendants only", () => {
    expect(pathIsSameOrDescendant("users", "users")).toBe(true);
    expect(pathIsSameOrDescendant("users.data", "users")).toBe(true);
    expect(pathIsSameOrDescendant("users.data.0", "users")).toBe(true);
    expect(pathIsSameOrDescendant("usersx", "users")).toBe(false);
    expect(pathIsSameOrDescendant("users", "users.data")).toBe(false);
  });
});

describe("matchesOnly", () => {
  it("is true for an only entry or its descendant", () => {
    expect(matchesOnly("users.data", ["users"])).toBe(true);
    expect(matchesOnly("users", ["users"])).toBe(true);
    expect(matchesOnly("users", ["users.data"])).toBe(false);
    expect(matchesOnly("posts", ["users", "comments"])).toBe(false);
  });
});

describe("leadsToOnly", () => {
  it("is true when the path is an ancestor of an only entry", () => {
    expect(leadsToOnly("users", ["users.data"])).toBe(true);
    expect(leadsToOnly("users.data", ["users.data.items"])).toBe(true);
    expect(leadsToOnly("user", ["users.data"])).toBe(false);
    expect(leadsToOnly("users", ["users"])).toBe(false);
  });
});

describe("matchesExcept", () => {
  it("is true for an except entry or its descendant", () => {
    expect(matchesExcept("users.data.0", ["users.data"])).toBe(true);
    expect(matchesExcept("users.data", ["users.data"])).toBe(true);
    expect(matchesExcept("users", ["users.data"])).toBe(false);
  });
});
