import { describe, expect, it } from "vitest";
import { scopeErrors } from "../../src/core/errors.js";

describe("scopeErrors", () => {
  it("returns errors at the top level when no bag is given", () => {
    expect(scopeErrors({ name: "required" }, null)).toEqual({
      errors: { name: "required" },
    });
  });

  it("namespaces errors under the bag name", () => {
    expect(scopeErrors({ name: "required" }, "user")).toEqual({
      errors: { user: { name: "required" } },
    });
  });

  it("treats empty string bag as no bag (falsy)", () => {
    expect(scopeErrors({ a: "b" }, "")).toEqual({ errors: { a: "b" } });
  });
});
