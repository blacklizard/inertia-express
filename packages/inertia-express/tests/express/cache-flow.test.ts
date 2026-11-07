import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryCacheStore, inertia, once } from "../../src/express/index.js";

const pageFromHtml = (html: string): Record<string, unknown> => {
  const json = /<script data-page="app" type="application\/json">(.*?)<\/script>/s.exec(html)?.[1];
  if (json === undefined) {
    throw new Error("no page script in response");
  }
  return JSON.parse(json) as Record<string, unknown>;
};

const onceExpiry = (html: string): number | undefined =>
  (pageFromHtml(html).onceProps as Record<string, { expiresAt: number }>).plans?.expiresAt;

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

  it("skips cache when top-level flash data is present", async () => {
    const ssr = vi.fn(async () => ({ body: "x" }));
    const app = express();
    app.use((req, _res, next) => {
      (req as unknown as { session: Record<string, unknown> }).session = { flash: { success: "hi" } };
      next();
    });
    app.use(
      inertia({
        ssr,
        flashFromSession: true,
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

  describe("cache hits render the live page", () => {
    const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);

    afterEach(() => {
      vi.useRealTimers();
    });

    it("refreshes once-prop expiry in the default root view on a HIT", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(T0);
      const ssr = vi.fn(async () => ({ body: "<p>x</p>", head: "" }));
      const app = express();
      app.use(inertia({ version: "v1", ssr, cache: { store: createMemoryCacheStore(), ttlSeconds: 600 } }));
      app.get("/", (_req, res) => {
        void res.inertia("Plans", { plans: once(() => ["a"]).as("plans").until(60) });
      });

      const r1 = await request(app).get("/");
      expect(r1.headers["x-inertia-cache"]).toBe("MISS");
      expect(onceExpiry(r1.text)).toBe(T0 + 60_000);

      vi.setSystemTime(T0 + 10_000);
      const r2 = await request(app).get("/");
      expect(r2.headers["x-inertia-cache"]).toBe("HIT");
      expect(ssr).toHaveBeenCalledTimes(1);
      expect(onceExpiry(r2.text)).toBe(T0 + 70_000);
    });

    it("rewrites the page script embedded in a full-root SSR body on a HIT", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(T0);
      const ssr = vi.fn(async ({ page }) => ({
        bodyIsFullRoot: true,
        body: `<script data-page="app" type="application/json">${JSON.stringify(page).replace(/</g, "\\u003C")}</script><div id="app"><p>${page.component}</p></div>`,
        head: ["<title>t</title>"],
      }));
      const app = express();
      app.use(inertia({ version: "v1", ssr, cache: { store: createMemoryCacheStore(), ttlSeconds: 600 } }));
      app.get("/", (_req, res) => {
        void res.inertia("Plans", { plans: once(() => ["<a>"]).as("plans").until(60) });
      });

      const r1 = await request(app).get("/");
      expect(r1.headers["x-inertia-cache"]).toBe("MISS");
      expect(onceExpiry(r1.text)).toBe(T0 + 60_000);

      vi.setSystemTime(T0 + 10_000);
      const r2 = await request(app).get("/");
      expect(r2.headers["x-inertia-cache"]).toBe("HIT");
      expect(ssr).toHaveBeenCalledTimes(1);
      expect(onceExpiry(r2.text)).toBe(T0 + 70_000);
      expect(r2.text).toContain('<div id="app"><p>Plans</p></div>');
      expect(r2.text).not.toContain("<a>");
      expect((pageFromHtml(r2.text).props as { plans: string[] }).plans).toEqual(["<a>"]);
    });

    it("serves the live url when two routes share a cache entry", async () => {
      const ssr = vi.fn(async () => ({ body: "<p>x</p>", head: "" }));
      const app = express();
      app.use(inertia({ version: "v1", ssr, cache: { store: createMemoryCacheStore(), ttlSeconds: 600 } }));
      const handler = (_req: express.Request, res: express.Response): void => {
        void res.inertia("Static", { a: 1 });
      };
      app.get("/one", handler);
      app.get("/two", handler);

      const r1 = await request(app).get("/one");
      expect(r1.headers["x-inertia-cache"]).toBe("MISS");
      const r2 = await request(app).get("/two");
      expect(r2.headers["x-inertia-cache"]).toBe("HIT");
      expect(pageFromHtml(r2.text).url).toBe("/two");
    });
  });
});
