/**
 * Inertia.js v3 protocol conformance suite.
 *
 * Drives a real Express app through every protocol behaviour end-to-end so a
 * regression in any spec area fails one obvious test. Grouped by spec section.
 */
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { always, deepMerge, defer, inertia, lazy, merge, optional } from "../../src/express/index.js";

function buildApp(opts: Parameters<typeof inertia>[0] = {}) {
  const app = express();
  app.use(express.json());
  app.use(inertia(opts));
  return app;
}

describe("v3 protocol conformance", () => {
  describe("request detection", () => {
    it("returns Inertia JSON for X-Inertia requests", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("Home", { a: 1 }));
      const r = await request(app).get("/").set("x-inertia", "true");
      expect(r.headers["content-type"]).toMatch(/application\/json/);
      expect(r.headers["x-inertia"]).toBe("true");
    });

    it("returns a full HTML document for browser visits", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("Home", { a: 1 }));
      const r = await request(app).get("/");
      expect(r.headers["content-type"]).toMatch(/text\/html/);
      expect(r.text).toContain('<div id="app">');
      expect(r.text).toContain('<script data-page="app" type="application/json">');
    });
  });

  describe("page object shape", () => {
    it("emits the minimal v3 page object", async () => {
      const app = buildApp({ version: "v1" });
      app.get("/dash", (_req, res) => void res.inertia("Dashboard", { x: 1 }));
      const r = await request(app).get("/dash").set("x-inertia", "true").set("x-inertia-version", "v1");
      const body = JSON.parse(r.text);
      expect(body).toMatchObject({
        component: "Dashboard",
        props: { x: 1 },
        url: "/dash",
        version: "v1",
        clearHistory: false,
        encryptHistory: false,
      });
    });
  });

  describe("shared props", () => {
    it("merges shared and page props with page winning", async () => {
      const app = buildApp({
        sharedProps: () => ({ auth: { user: "alice" }, dup: "shared" }),
      });
      app.get("/", (_req, res) => void res.inertia("Home", { dup: "page" }));
      const r = await request(app).get("/").set("x-inertia", "true");
      const body = JSON.parse(r.text);
      expect(body.props.auth).toEqual({ user: "alice" });
      expect(body.props.dup).toBe("page");
    });
  });

  describe("prop helpers", () => {
    it("lazy props are evaluated and included on full visits", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { v: lazy(async () => 7) }));
      const r = await request(app).get("/").set("x-inertia", "true");
      expect(JSON.parse(r.text).props.v).toBe(7);
    });

    it("optional props are omitted on full visits, included when requested", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { heavy: optional(() => "h"), a: 1 }));
      const full = await request(app).get("/").set("x-inertia", "true");
      expect(JSON.parse(full.text).props.heavy).toBeUndefined();
      const partial = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "X")
        .set("x-inertia-partial-data", "heavy");
      expect(JSON.parse(partial.text).props).toEqual({ heavy: "h" });
    });

    it("deferred props are omitted initially and listed in deferredProps by group", async () => {
      const app = buildApp();
      app.get(
        "/",
        (_req, res) =>
          void res.inertia("X", {
            stats: defer(() => 1, "dash"),
            users: defer(() => 2, "dash"),
            feed: defer(() => 3, "feed"),
          }),
      );
      const initial = await request(app).get("/").set("x-inertia", "true");
      const body = JSON.parse(initial.text);
      expect(body.props).toEqual({});
      expect(body.deferredProps).toEqual({ dash: ["stats", "users"], feed: ["feed"] });
    });

    it("deferred props are evaluated on the follow-up partial reload", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { stats: defer(async () => 42, "dash") }));
      const r = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "X")
        .set("x-inertia-partial-data", "stats");
      expect(JSON.parse(r.text).props.stats).toBe(42);
    });

    it("always props survive a partial-except filter", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { flash: always(() => "msg"), a: 1 }));
      const r = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "X")
        .set("x-inertia-partial-except", "flash");
      expect(JSON.parse(r.text).props).toEqual({ flash: "msg", a: 1 });
    });
  });

  describe("partial reloads", () => {
    it("X-Inertia-Partial-Data keeps only the named keys", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { a: 1, b: 2, c: 3 }));
      const r = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "X")
        .set("x-inertia-partial-data", "a,c");
      expect(JSON.parse(r.text).props).toEqual({ a: 1, c: 3 });
    });

    it("X-Inertia-Partial-Except drops the named keys", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { a: 1, b: 2, c: 3 }));
      const r = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "X")
        .set("x-inertia-partial-except", "b");
      expect(JSON.parse(r.text).props).toEqual({ a: 1, c: 3 });
    });

    it("partial-except takes precedence over partial-data", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { a: 1, b: 2 }));
      const r = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "X")
        .set("x-inertia-partial-data", "a,b")
        .set("x-inertia-partial-except", "b");
      expect(JSON.parse(r.text).props).toEqual({ a: 1 });
    });

    it("a partial reload for a different component is treated as a full visit", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { a: 1, b: 2 }));
      const r = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "Other")
        .set("x-inertia-partial-data", "a");
      expect(JSON.parse(r.text).props).toEqual({ a: 1, b: 2 });
    });

    it("a dotted partial-data key keeps the matching top-level prop", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { users: { data: [1] }, meta: 2 }));
      const r = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "X")
        .set("x-inertia-partial-data", "users.data");
      expect(JSON.parse(r.text).props).toEqual({ users: { data: [1] } });
    });

    it("a dotted partial-except key drops the matching top-level prop", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", { users: { data: [1] }, meta: 2 }));
      const r = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "X")
        .set("x-inertia-partial-except", "users.data");
      expect(JSON.parse(r.text).props).toEqual({ meta: 2 });
    });
  });

  describe("merge props", () => {
    it("merge() props are listed in mergeProps", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("Feed", { posts: merge([{ id: 1 }]) }));
      const r = await request(app).get("/").set("x-inertia", "true");
      const body = JSON.parse(r.text);
      expect(body.mergeProps).toEqual(["posts"]);
      expect(body.props.posts).toEqual([{ id: 1 }]);
    });

    it("deepMerge() + matchOn emit deepMergeProps and dotted matchPropsOn", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("Feed", { rows: deepMerge([{ id: 1 }], "id") }));
      const r = await request(app).get("/").set("x-inertia", "true");
      const body = JSON.parse(r.text);
      expect(body.deepMergeProps).toEqual(["rows"]);
      expect(body.matchPropsOn).toEqual(["rows.id"]);
      expect(body.mergeProps).toBeUndefined();
    });

    it("X-Inertia-Reset drops a key from mergeProps but still sends the value", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("Feed", { posts: merge([{ id: 1 }]) }));
      const r = await request(app)
        .get("/")
        .set("x-inertia", "true")
        .set("x-inertia-partial-component", "Feed")
        .set("x-inertia-partial-data", "posts")
        .set("x-inertia-reset", "posts");
      const body = JSON.parse(r.text);
      expect(body.mergeProps).toBeUndefined();
      expect(body.props.posts).toEqual([{ id: 1 }]);
    });
  });

  describe("asset versioning", () => {
    it("accepts a request whose version matches the server", async () => {
      const app = buildApp({ version: "v2" });
      app.get("/", (_req, res) => void res.inertia("X", {}));
      const r = await request(app).get("/").set("x-inertia", "true").set("x-inertia-version", "v2");
      expect(r.status).toBe(200);
    });

    it("returns 409 + X-Inertia-Location on a version mismatch", async () => {
      const app = buildApp({ version: "v2" });
      app.get("/page", (_req, res) => void res.inertia("X", {}));
      const r = await request(app).get("/page").set("x-inertia", "true").set("x-inertia-version", "stale");
      expect(r.status).toBe(409);
      expect(r.headers["x-inertia-location"]).toBe("/page");
    });
  });

  describe("redirects", () => {
    it("promotes a redirect to 303 after PUT/PATCH/DELETE on Inertia visits", async () => {
      const app = buildApp();
      app.put("/users/1", (_req, res) => res.redirect("/users"));
      const r = await request(app).put("/users/1").set("x-inertia", "true").redirects(0);
      expect(r.status).toBe(303);
      expect(r.headers.location).toBe("/users");
    });

    it("inertiaLocation responds 409 for Inertia and 302 for browser visits", async () => {
      const app = buildApp();
      app.get("/x", (_req, res) => res.inertiaLocation("https://example.com/out"));
      const xhr = await request(app).get("/x").set("x-inertia", "true");
      expect(xhr.status).toBe(409);
      expect(xhr.headers["x-inertia-location"]).toBe("https://example.com/out");
      const browser = await request(app).get("/x").redirects(0);
      expect(browser.status).toBe(302);
      expect(browser.headers.location).toBe("https://example.com/out");
    });
  });

  describe("history", () => {
    it("forwards clearHistory / encryptHistory overrides into the page object", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("X", {}, { clearHistory: true, encryptHistory: true }));
      const r = await request(app).get("/").set("x-inertia", "true");
      const body = JSON.parse(r.text);
      expect(body.clearHistory).toBe(true);
      expect(body.encryptHistory).toBe(true);
    });
  });

  describe("error bags", () => {
    it("inertiaErrors namespaces validation errors under the given bag", async () => {
      const app = express();
      let captured: unknown;
      app.use(inertia());
      app.post("/users", (_req, res) => {
        res.inertiaErrors({ email: "invalid" }, "createUser");
        captured = res.locals.inertiaErrors;
        res.status(204).end();
      });
      await request(app).post("/users");
      expect(captured).toEqual({ createUser: { email: "invalid" } });
    });
  });

  describe("SSR", () => {
    it("inlines the SSR body into the HTML shell on browser visits", async () => {
      const app = buildApp({
        ssr: async ({ page }) => ({
          body: `<main>SSR:${page.component}</main>`,
          head: `<meta name="ssr" />`,
        }),
      });
      app.get("/", (_req, res) => void res.inertia("Home", {}));
      const r = await request(app).get("/");
      expect(r.text).toContain("SSR:Home");
      expect(r.text).toContain('name="ssr"');
    });

    it("omits deferred props from the SSR render but keeps the deferredProps map", async () => {
      let seen: { props: unknown; deferred: unknown } | undefined;
      const app = buildApp({
        ssr: async ({ page }) => {
          seen = { props: page.props, deferred: page.deferredProps };
          return { body: "<main>SSR</main>" };
        },
      });
      app.get("/", (_req, res) => void res.inertia("Dash", { fast: 1, slow: defer(() => 9, "g") }));
      const r = await request(app).get("/");
      expect(seen).toEqual({ props: { fast: 1 }, deferred: { g: ["slow"] } });
      expect(r.text).toContain('"deferredProps"');
    });
  });

  describe("status code", () => {
    it("preserves a controller-set status on the Inertia JSON response", async () => {
      const app = buildApp();
      app.get("/missing", (_req, res) => void res.status(404).inertia("NotFound", {}));
      const r = await request(app).get("/missing").set("x-inertia", "true");
      expect(r.status).toBe(404);
      expect(r.headers["content-type"]).toMatch(/application\/json/);
      expect(JSON.parse(r.text).component).toBe("NotFound");
    });

    it("preserves a controller-set status on the HTML response", async () => {
      const app = buildApp();
      app.get("/missing", (_req, res) => void res.status(404).inertia("NotFound", {}));
      const r = await request(app).get("/missing");
      expect(r.status).toBe(404);
      expect(r.headers["content-type"]).toMatch(/text\/html/);
    });
  });

  describe("asset versioning edge cases", () => {
    it("returns 409 when the client sends no version but the server has one", async () => {
      const app = buildApp({ version: "v2" });
      app.get("/page", (_req, res) => void res.inertia("X", {}));
      const r = await request(app).get("/page").set("x-inertia", "true");
      expect(r.status).toBe(409);
      expect(r.headers["x-inertia-location"]).toBe("/page");
    });

    it("returns 409 when the client sends an empty version but the server has one", async () => {
      const app = buildApp({ version: "v2" });
      app.get("/page", (_req, res) => void res.inertia("X", {}));
      const r = await request(app).get("/page").set("x-inertia", "true").set("x-inertia-version", "");
      expect(r.status).toBe(409);
      expect(r.headers["x-inertia-location"]).toBe("/page");
    });
  });

  describe("vary header", () => {
    it("emits a single deduplicated Vary header", async () => {
      const app = buildApp();
      app.get("/", (_req, res) => void res.inertia("Home", {}));
      const r = await request(app).get("/").set("x-inertia", "true");
      const vary = String(r.headers.vary).toLowerCase();
      expect(vary.match(/accept/g)).toHaveLength(1);
      expect(vary.match(/x-inertia/g)).toHaveLength(1);
    });
  });
});
