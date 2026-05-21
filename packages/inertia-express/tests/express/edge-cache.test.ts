import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { applyEdgeCache, inertia } from "../../src/express/index.js";

describe("edgeCache policy", () => {
  it("sets Cache-Control headers when policy returns a decision", async () => {
    const app = express();
    app.use(
      inertia({
        edgeCache: () => ({ sMaxAge: 60, maxAge: 0, staleWhileRevalidate: 30 }),
      }),
    );
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });
    const r = await request(app).get("/");
    expect(r.headers["cache-control"]).toBe("public, s-maxage=60, max-age=0, stale-while-revalidate=30");
  });

  it("opts out when policy returns null", async () => {
    const app = express();
    app.use(inertia({ edgeCache: () => null }));
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });
    const r = await request(app).get("/");
    expect(r.headers["cache-control"]).toBeUndefined();
  });

  it("does not apply for Inertia (XHR) responses", async () => {
    const app = express();
    app.use(inertia({ edgeCache: () => ({ sMaxAge: 60 }) }));
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });
    const r = await request(app).get("/").set("x-inertia", "true");
    expect(r.headers["cache-control"]).toBeUndefined();
  });

  it("appends extra Vary values from decision", async () => {
    const app = express();
    app.use(
      inertia({
        edgeCache: () => ({ sMaxAge: 60, vary: ["Cookie", "Accept-Language"] }),
      }),
    );
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });
    const r = await request(app).get("/");
    const vary = r.headers.vary ?? "";
    expect(vary).toContain("Cookie");
    expect(vary).toContain("Accept-Language");
    expect(vary).toContain("X-Inertia");
  });

  it("applyEdgeCache skips header writes when statusCode is 3xx+", async () => {
    const headers: Record<string, string> = {};
    const fakeRes = {
      statusCode: 302,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      getHeader() {
        return undefined;
      },
    } as unknown as import("express").Response;
    applyEdgeCache({ sMaxAge: 60 }, fakeRes);
    expect(headers["Cache-Control"]).toBeUndefined();
  });

  it("applyEdgeCache merges with an existing Vary header", async () => {
    const headers: Record<string, string> = { Vary: "Origin" };
    const fakeRes = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      getHeader(name: string) {
        return headers[name];
      },
    } as unknown as import("express").Response;
    applyEdgeCache({ sMaxAge: 60, vary: ["Cookie"] }, fakeRes);
    expect(headers.Vary).toContain("Origin");
    expect(headers.Vary).toContain("Cookie");
  });

  it("applyEdgeCache is a no-op for null decisions", async () => {
    const headers: Record<string, string> = {};
    const fakeRes = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      getHeader() {
        return undefined;
      },
    } as unknown as import("express").Response;
    applyEdgeCache(null, fakeRes);
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it("skips Cache-Control when sMaxAge <= 0", async () => {
    const app = express();
    app.use(inertia({ edgeCache: () => ({ sMaxAge: 0 }) }));
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });
    const r = await request(app).get("/");
    expect(r.headers["cache-control"]).toBeUndefined();
  });

  it("applyEdgeCache Vary deduplication is case-sensitive (Set identity)", () => {
    const headers: Record<string, string> = { Vary: "Accept, x-inertia" };
    const fakeRes = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      getHeader(name: string) {
        return headers[name];
      },
    } as unknown as import("express").Response;
    applyEdgeCache({ sMaxAge: 60, vary: ["X-Inertia", "Accept-Language"] }, fakeRes);
    expect(headers.Vary).toBe("Accept, x-inertia, X-Inertia, Accept-Language");
  });

  it("applyEdgeCache filters out empty and whitespace-only vary entries", () => {
    const headers: Record<string, string> = {};
    const fakeRes = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      getHeader() {
        return undefined;
      },
    } as unknown as import("express").Response;
    applyEdgeCache({ sMaxAge: 60, vary: ["", "   ", "Cookie"] }, fakeRes);
    expect(headers.Vary).toContain("Cookie");
    expect(headers.Vary).not.toContain("   ");
    expect(headers.Vary).not.toMatch(/(^|,)\s*,/); // no empty segments
  });
});
