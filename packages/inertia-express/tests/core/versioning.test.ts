import { describe, expect, it } from "vitest";
import { isVersionMismatch, resolveVersion } from "../../src/core/versioning.js";

describe("resolveVersion", () => {
  it("returns null when no resolver is configured", async () => {
    expect(await resolveVersion(undefined, {})).toBeNull();
  });

  it("returns string resolvers as-is", async () => {
    expect(await resolveVersion("v1", {})).toBe("v1");
  });

  it("calls function resolvers with the request", async () => {
    const resolver = (req: { build: string }) => req.build;
    expect(await resolveVersion(resolver, { build: "abc" })).toBe("abc");
  });

  it("awaits async resolvers", async () => {
    const resolver = async () => "async";
    expect(await resolveVersion(resolver, {})).toBe("async");
  });

  it("normalizes function resolvers returning null/undefined", async () => {
    expect(await resolveVersion(() => null, {})).toBeNull();
    expect(await resolveVersion(() => undefined as never, {})).toBeNull();
  });

  it("returns null when resolver itself is null", async () => {
    expect(await resolveVersion(null as never, {})).toBeNull();
  });
});

describe("isVersionMismatch", () => {
  it("returns false when no server version is configured", () => {
    expect(isVersionMismatch(null, "anything")).toBe(false);
  });

  it("returns true when the client version is missing but the server has one", () => {
    expect(isVersionMismatch("v1", null)).toBe(true);
    expect(isVersionMismatch("v1", "")).toBe(true);
  });

  it("returns false when both server and client versions are empty", () => {
    expect(isVersionMismatch("", null)).toBe(false);
    expect(isVersionMismatch("", "")).toBe(false);
  });

  it("returns true when versions differ", () => {
    expect(isVersionMismatch("v1", "v2")).toBe(true);
  });

  it("returns false when versions match", () => {
    expect(isVersionMismatch("v1", "v1")).toBe(false);
  });
});
