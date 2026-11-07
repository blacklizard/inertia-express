import { describe, expect, it } from "vitest";
import { resolveValidationErrors, scopeErrors } from "../../src/core/errors.js";

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

describe("resolveValidationErrors", () => {
  it("validation errors can be empty", () => {
    expect(resolveValidationErrors(undefined, null)).toEqual({});
    expect(resolveValidationErrors({}, "example")).toEqual({});
  });

  it("validation errors are mapped flat from the default bag", () => {
    expect(resolveValidationErrors({ default: { name: "required" } }, null)).toEqual({ name: "required" });
  });

  it("validation errors with named error bags are scoped", () => {
    expect(resolveValidationErrors({ example: { name: "required" } }, null)).toEqual({ example: { name: "required" } });
  });

  it("validation errors are scoped to error bag header", () => {
    expect(resolveValidationErrors({ default: { name: "required" } }, "example")).toEqual({ example: { name: "required" } });
  });

  it("error bag header is ignored when no default bag exists", () => {
    expect(resolveValidationErrors({ example: { name: "required" } }, "other")).toEqual({ example: { name: "required" } });
  });

  it("default bag wins over named bags when both exist and no header is sent", () => {
    expect(resolveValidationErrors({ default: { a: "x" }, example: { b: "y" } }, null)).toEqual({ a: "x" });
  });
});
