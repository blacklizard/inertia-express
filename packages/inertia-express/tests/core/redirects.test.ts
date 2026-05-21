import { describe, expect, it } from "vitest";
import { INERTIA_LOCATION_STATUS, INERTIA_REDIRECT_STATUS, inertiaRedirectStatus } from "../../src/core/redirects.js";

describe("inertiaRedirectStatus", () => {
  it("uses 303 for PUT/PATCH/DELETE", () => {
    expect(inertiaRedirectStatus("PUT")).toBe(303);
    expect(inertiaRedirectStatus("patch")).toBe(303);
    expect(inertiaRedirectStatus("Delete")).toBe(303);
  });

  it("uses fallback 302 for GET/POST", () => {
    expect(inertiaRedirectStatus("GET")).toBe(302);
    expect(inertiaRedirectStatus("POST")).toBe(302);
  });

  it("respects custom fallback for non-mutating methods", () => {
    expect(inertiaRedirectStatus("GET", 301)).toBe(301);
  });

  it("exposes spec status constants", () => {
    expect(INERTIA_REDIRECT_STATUS).toBe(303);
    expect(INERTIA_LOCATION_STATUS).toBe(409);
  });
});
