import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createMemoryCacheStore, inertia } from "../../src/express/index.js";

describe("middleware view cache", () => {
  it("caches HTML and serves a HIT on the second visit", async () => {
    const ssr = vi.fn(async ({ page }) => ({
      body: `<p>${page.component}</p>`,
      head: "",
    }));
    const app = express();
    app.use(
      inertia({
        version: "v1",
        ssr,
        cache: { store: createMemoryCacheStore(), ttlSeconds: 60 },
      }),
    );
    app.get("/", (_req, res) => {
      void res.inertia("Home", { greeting: "hi" });
    });

    const r1 = await request(app).get("/");
    expect(r1.headers["x-inertia-cache"]).toBe("MISS");
    expect(ssr).toHaveBeenCalledTimes(1);

    const r2 = await request(app).get("/");
    expect(r2.headers["x-inertia-cache"]).toBe("HIT");
    expect(ssr).toHaveBeenCalledTimes(1); // still 1 — no re-render
    expect(r2.text).toContain("<p>Home</p>");
  });

  it("invalidates on version bump (deploy)", async () => {
    const ssr = vi.fn(async ({ page }) => ({ body: `<p>v=${page.version}</p>` }));
    const store = createMemoryCacheStore();
    let ver = "v1";
    const app = express();
    app.use(
      inertia({
        version: () => ver,
        ssr,
        cache: { store, ttlSeconds: 60 },
      }),
    );
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });

    await request(app).get("/"); // store v1
    await request(app).get("/"); // hit v1
    ver = "v2";
    const r3 = await request(app).get("/");
    expect(r3.headers["x-inertia-cache"]).toBe("MISS");
    expect(r3.text).toContain("v=v2");
  });

  it("skips cache for Inertia (XHR) visits", async () => {
    const ssr = vi.fn(async () => ({ body: "x" }));
    const app = express();
    app.use(
      inertia({
        version: "v1",
        ssr,
        cache: { store: createMemoryCacheStore() },
      }),
    );
    app.get("/", (_req, res) => {
      void res.inertia("Home", { a: 1 });
    });

    const r = await request(app).get("/").set("x-inertia", "true").set("x-inertia-version", "v1");
    expect(r.headers["x-inertia-cache"]).toBeUndefined();
  });

  it("skips cache when flash/errors props are present", async () => {
    const ssr = vi.fn(async () => ({ body: "x" }));
    const app = express();
    app.use(
      inertia({
        ssr,
        sharedProps: () => ({ flash: { success: "hi" } }),
        cache: { store: createMemoryCacheStore() },
      }),
    );
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });
    const r = await request(app).get("/");
    expect(r.headers["x-inertia-cache"]).toBeUndefined();
  });

  it("differentiates by discriminator", async () => {
    const ssr = vi.fn(async ({ page }) => ({
      body: `<p>${(page.props as { lang: string }).lang}</p>`,
    }));
    const app = express();
    app.use((req, _res, next) => {
      (req as unknown as { lang: string }).lang = (req.headers["x-lang"] as string) ?? "en";
      next();
    });
    app.use(
      inertia({
        ssr,
        sharedProps: (req) => ({
          lang: (req as unknown as { lang: string }).lang,
        }),
        cache: {
          store: createMemoryCacheStore(),
          discriminator: (req) => (req as unknown as { lang: string }).lang,
        },
      }),
    );
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });
    await request(app).get("/").set("x-lang", "en");
    await request(app).get("/").set("x-lang", "fr");
    expect(ssr).toHaveBeenCalledTimes(2);
    const enHit = await request(app).get("/").set("x-lang", "en");
    expect(enHit.headers["x-inertia-cache"]).toBe("HIT");
  });

  it("propagates cache.onError when store throws", async () => {
    const onError = vi.fn();
    const broken = {
      get: async () => {
        throw new Error("boom");
      },
      set: async () => {
        throw new Error("boom");
      },
      delete: async () => {},
    };
    const app = express();
    app.use(
      inertia({
        version: "v1",
        ssr: async () => ({ body: "x" }),
        cache: { store: broken, onError },
      }),
    );
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });
    const r = await request(app).get("/");
    expect(r.status).toBe(200);
    // get + set both errored => at least 2 calls
    expect(onError.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
