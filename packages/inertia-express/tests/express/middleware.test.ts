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

describe("inertia middleware", () => {
  it("returns full HTML on browser visits", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("Home", { greeting: "hi" });
    });
    const r = await request(app).get("/");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    expect(r.text).toContain('id="app"');
    expect(r.text).toContain("data-page=");
    expect(r.text).toContain("Home");
  });

  it("returns Inertia JSON on x-inertia requests", async () => {
    const app = buildApp();
    app.get("/users", (_req, res) => {
      void res.inertia("Users/Index", { users: ["a"] });
    });
    const r = await request(app).get("/users").set("x-inertia", "true");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/application\/json/);
    expect(r.headers["x-inertia"]).toBe("true");
    const body = JSON.parse(r.text);
    expect(body.component).toBe("Users/Index");
    expect(body.props.users).toEqual(["a"]);
    expect(body.url).toBe("/users");
    expect(body.clearHistory).toBe(false);
    expect(body.encryptHistory).toBe(false);
  });

  it("merges shared props with page props (page wins)", async () => {
    const app = buildApp({
      sharedProps: () => ({ auth: { user: "alice" }, override: "shared" }),
    });
    app.get("/", (_req, res) => {
      void res.inertia("Home", { override: "page" });
    });
    const r = await request(app).get("/").set("x-inertia", "true");
    const body = JSON.parse(r.text);
    expect(body.props.auth).toEqual({ user: "alice" });
    expect(body.props.override).toBe("page");
  });

  it("evaluates lazy props", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("X", { value: lazy(async () => 7) });
    });
    const r = await request(app).get("/").set("x-inertia", "true");
    const body = JSON.parse(r.text);
    expect(body.props.value).toBe(7);
  });

  it("omits optional props on initial visits", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("X", { heavy: optional(() => "x") });
    });
    const r = await request(app).get("/").set("x-inertia", "true");
    const body = JSON.parse(r.text);
    expect(body.props.heavy).toBeUndefined();
  });

  it("includes optional props on requested partial reloads", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("X", { heavy: optional(() => "ok"), other: 1 });
    });
    const r = await request(app)
      .get("/")
      .set("x-inertia", "true")
      .set("x-inertia-partial-component", "X")
      .set("x-inertia-partial-data", "heavy");
    const body = JSON.parse(r.text);
    expect(body.props).toEqual({ heavy: "ok" });
  });

  it("excludes keys named in partial-except", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("X", { a: 1, b: 2, c: 3 });
    });
    const r = await request(app)
      .get("/")
      .set("x-inertia", "true")
      .set("x-inertia-partial-component", "X")
      .set("x-inertia-partial-except", "b");
    const body = JSON.parse(r.text);
    expect(body.props).toEqual({ a: 1, c: 3 });
  });

  it("emits deferredProps key map on initial visits", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("X", {
        stats: defer(() => 1, "dash"),
        users: defer(() => 2, "dash"),
      });
    });
    const r = await request(app).get("/").set("x-inertia", "true");
    const body = JSON.parse(r.text);
    expect(body.props).toEqual({});
    expect(body.deferredProps).toEqual({ dash: ["stats", "users"] });
  });

  it("includes always props despite a partial-except request", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("X", { flash: always(() => "msg"), a: 1 });
    });
    const r = await request(app)
      .get("/")
      .set("x-inertia", "true")
      .set("x-inertia-partial-component", "X")
      .set("x-inertia-partial-except", "flash");
    const body = JSON.parse(r.text);
    expect(body.props).toEqual({ flash: "msg", a: 1 });
  });

  it("emits mergeProps for a merge() prop on partial reloads", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("Feed", { posts: merge([{ id: 1 }]) });
    });
    const r = await request(app)
      .get("/")
      .set("x-inertia", "true")
      .set("x-inertia-partial-component", "Feed")
      .set("x-inertia-partial-data", "posts");
    const body = JSON.parse(r.text);
    expect(body.mergeProps).toEqual(["posts"]);
    expect(body.props.posts).toEqual([{ id: 1 }]);
  });

  it("emits deepMergeProps and matchPropsOn for a deepMerge() prop", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("Feed", { rows: deepMerge([{ id: 1 }], "id") });
    });
    const r = await request(app)
      .get("/")
      .set("x-inertia", "true")
      .set("x-inertia-partial-component", "Feed")
      .set("x-inertia-partial-data", "rows");
    const body = JSON.parse(r.text);
    expect(body.deepMergeProps).toEqual(["rows"]);
    expect(body.matchPropsOn).toEqual(["rows.id"]);
    expect(body.props.rows).toEqual([{ id: 1 }]);
  });

  it("excludes a merge key from mergeProps when X-Inertia-Reset names it", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      void res.inertia("Feed", { posts: merge([{ id: 1 }]) });
    });
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

  it("returns 409 + X-Inertia-Location on version mismatch (GET)", async () => {
    const app = buildApp({ version: "v2" });
    app.get("/x", (_req, res) => {
      void res.inertia("X", {});
    });
    const r = await request(app).get("/x").set("x-inertia", "true").set("x-inertia-version", "v1");
    expect(r.status).toBe(409);
    expect(r.headers["x-inertia-location"]).toBe("/x");
  });

  it("does not trigger version mismatch when versions match", async () => {
    const app = buildApp({ version: "v1" });
    app.get("/x", (_req, res) => {
      void res.inertia("X", {});
    });
    const r = await request(app).get("/x").set("x-inertia", "true").set("x-inertia-version", "v1");
    expect(r.status).toBe(200);
  });

  it("inertiaLocation responds 409 for Inertia requests", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      res.inertiaLocation("https://example.com/external");
    });
    const r = await request(app).get("/").set("x-inertia", "true");
    expect(r.status).toBe(409);
    expect(r.headers["x-inertia-location"]).toBe("https://example.com/external");
  });

  it("inertiaLocation falls back to 302 for browser requests", async () => {
    const app = buildApp();
    app.get("/", (_req, res) => {
      res.inertiaLocation("/elsewhere");
    });
    const r = await request(app).get("/").redirects(0);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("/elsewhere");
  });

  it("promotes redirects to 303 after PUT/PATCH/DELETE on Inertia requests", async () => {
    const app = buildApp();
    app.put("/users/1", (_req, res) => {
      res.redirect("/users");
    });
    const r = await request(app).put("/users/1").set("x-inertia", "true").redirects(0);
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe("/users");
  });

  it("uses custom rootView for non-Inertia requests", async () => {
    const app = buildApp({
      rootView: ({ page }) => `<html><body><pre>${page.component}</pre></body></html>`,
    });
    app.get("/", (_req, res) => {
      void res.inertia("MyPage", {});
    });
    const r = await request(app).get("/");
    expect(r.text).toContain("<pre>MyPage</pre>");
  });

  it("invokes ssr hook and inlines body into default rootView", async () => {
    const app = buildApp({
      ssr: async ({ page }) => ({
        body: `<div>SSR:${page.component}</div>`,
        head: `<meta name="ssr" />`,
      }),
    });
    app.get("/", (_req, res) => {
      void res.inertia("Hello", {});
    });
    const r = await request(app).get("/");
    expect(r.text).toContain("SSR:Hello");
    expect(r.text).toContain('name="ssr"');
  });

  it("omits deferred props from the SSR render but keeps the deferredProps map", async () => {
    let seen: { props: unknown; deferred: unknown } | undefined;
    const app = buildApp({
      ssr: async ({ page }) => {
        seen = { props: page.props, deferred: page.deferredProps };
        return { body: "<div>SSR</div>" };
      },
    });
    app.get("/", (_req, res) => {
      void res.inertia("Dash", { fast: 1, slow: defer(() => 99, "g") });
    });
    const r = await request(app).get("/");
    expect(r.status).toBe(200);
    expect(seen).toEqual({ props: { fast: 1 }, deferred: { g: ["slow"] } });
    expect(r.text).toContain('"deferredProps"');
  });

  it("treats SSR result with bodyIsFullRoot as the entire root element", async () => {
    const app = buildApp({
      ssr: async () => ({
        body: `<div id="app" data-page="{}">FULL</div>`,
        bodyIsFullRoot: true,
      }),
    });
    app.get("/", (_req, res) => {
      void res.inertia("X", {});
    });
    const r = await request(app).get("/");
    expect(r.text).toContain('<div id="app" data-page="{}">FULL</div>');
    // No nested wrap.
    expect(r.text.match(/data-page=/g)?.length ?? 0).toBe(1);
  });

  it("exposes ssr result on res.locals.ssr for custom rootView", async () => {
    const app = buildApp({
      ssr: async () => ({ body: "B", head: "H" }),
      rootView: ({ res }) => {
        const ssr = res.locals.ssr as { body: string; head: string };
        return `<x>${ssr.head}|${ssr.body}</x>`;
      },
    });
    app.get("/", (_req, res) => {
      void res.inertia("X", {});
    });
    const r = await request(app).get("/");
    expect(r.text).toBe("<x>H|B</x>");
  });

  it("ssr returning null falls back to client-only render", async () => {
    const app = buildApp({
      ssr: async () => null,
    });
    app.get("/", (_req, res) => {
      void res.inertia("X", {});
    });
    const r = await request(app).get("/");
    expect(r.text).toContain('id="app"');
    expect(r.text).toContain("data-page=");
  });

  it("populates req.inertia on every request", async () => {
    const app = buildApp();
    let captured: unknown;
    app.get("/", (req, res) => {
      captured = req.inertia;
      res.json({});
    });
    await request(app).get("/?x=1").set("x-inertia", "true").set("x-inertia-version", "v9");
    expect(captured).toMatchObject({
      isInertia: true,
      version: "v9",
      method: "GET",
    });
  });

  it("inertiaErrors writes to req.session.errors when a session exists", async () => {
    const app = express();
    let captured: Record<string, unknown> | undefined;
    app.use((req, _res, next) => {
      (req as unknown as { session: Record<string, unknown> }).session = {
        errors: { existing: "keep me" },
      };
      next();
    });
    app.use(inertia());
    app.post("/users", (req, res) => {
      res.inertiaErrors({ name: "required" });
      captured = (req as unknown as { session: Record<string, unknown> }).session.errors as Record<string, unknown>;
      res.status(204).end();
    });
    await request(app).post("/users");
    expect(captured).toEqual({ existing: "keep me", name: "required" });
  });

  it("inertiaErrors falls back to res.locals when no session exists", async () => {
    const app = express();
    let captured: unknown;
    app.use(inertia());
    app.post("/users", (_req, res) => {
      res.inertiaErrors({ email: "invalid" }, "user");
      captured = res.locals.inertiaErrors;
      res.status(204).end();
    });
    await request(app).post("/users");
    expect(captured).toEqual({ user: { email: "invalid" } });
  });

  it("inertiaFlash writes flash to session for next request", async () => {
    const app = express();
    let captured: unknown;
    app.use((req, _res, next) => {
      (req as unknown as { session: Record<string, unknown> }).session = {};
      next();
    });
    app.use(inertia());
    app.post("/submit", (req, res) => {
      res.inertiaFlash({ success: "Saved!" });
      captured = (req as unknown as { session: Record<string, unknown> }).session.flash;
      res.status(204).end();
    });
    await request(app).post("/submit");
    expect(captured).toEqual({ success: "Saved!" });
  });

  it("inertiaFlash is a no-op when no session is wired", async () => {
    const app = express();
    app.use(inertia());
    app.post("/submit", (_req, res) => {
      // Must not throw when session is absent.
      res.inertiaFlash({ success: "Saved!" });
      res.status(204).end();
    });
    const r = await request(app).post("/submit");
    expect(r.status).toBe(204);
  });

  it("respects res.redirect(status, url) signature on Inertia visits", async () => {
    const app = buildApp();
    app.get("/old", (_req, res) => {
      res.redirect(301, "/new");
    });
    const r = await request(app).get("/old").set("x-inertia", "true").redirects(0);
    expect(r.status).toBe(301);
    expect(r.headers.location).toBe("/new");
  });

  it("promotes explicit 302 to 303 on PUT/PATCH/DELETE Inertia visits", async () => {
    const app = buildApp();
    app.patch("/users/1", (_req, res) => {
      res.redirect(302, "/users");
    });
    app.delete("/users/2", (_req, res) => {
      res.redirect(302, "/users");
    });
    const patched = await request(app).patch("/users/1").set("x-inertia", "true").redirects(0);
    expect(patched.status).toBe(303);
    const deleted = await request(app).delete("/users/2").set("x-inertia", "true").redirects(0);
    expect(deleted.status).toBe(303);
  });

  it("does not patch res.redirect on non-Inertia visits", async () => {
    const app = buildApp();
    app.put("/users/1", (_req, res) => {
      res.redirect("/users");
    });
    const r = await request(app).put("/users/1").redirects(0);
    expect(r.status).toBe(302);
  });

  it("preserves an existing Vary header set by upstream middleware", async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.setHeader("Vary", "Origin");
      next();
    });
    app.use(inertia());
    app.get("/", (_req, res) => {
      void res.inertia("Home", {});
    });
    const r = await request(app).get("/");
    expect(r.headers.vary).toMatch(/Origin/);
    expect(r.headers.vary).toMatch(/Accept/);
    expect(r.headers.vary).toMatch(/X-Inertia/);
  });

  it("forwards thrown errors via next(err) to the express error handler", async () => {
    const app = express();
    app.use(
      inertia({
        sharedProps: () => {
          throw new Error("shared boom");
        },
      }),
    );
    app.get("/boom", (_req, res) => {
      void res.inertia("X", {});
    });
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).type("text/plain").send(`caught:${err.message}`);
    });
    const r = await request(app).get("/boom");
    expect(r.status).toBe(500);
    expect(r.text).toBe("caught:shared boom");
  });
});

describe("res.inertiaError", () => {
  it("renders the Error component as Inertia JSON with the status prop", async () => {
    const app = buildApp();
    app.get("/missing", (_req, res) => {
      void res.inertiaError(404);
    });
    const r = await request(app).get("/missing").set("x-inertia", "true");
    expect(r.status).toBe(404);
    expect(r.headers["content-type"]).toMatch(/application\/json/);
    expect(r.headers["x-inertia"]).toBe("true");
    const body = JSON.parse(r.text);
    expect(body.component).toBe("Error");
    expect(body.props.status).toBe(404);
  });

  it("renders standalone HTML for plain browser loads", async () => {
    const app = buildApp();
    app.get("/missing", (_req, res) => {
      void res.inertiaError(404);
    });
    const r = await request(app).get("/missing");
    expect(r.status).toBe(404);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    expect(r.text).toContain("<h1>404</h1>");
    expect(r.text).toContain("Page Not Found");
    expect(r.text).not.toContain("data-page=");
  });

  it("uses the explicit message in the HTML fallback", async () => {
    const app = buildApp();
    app.get("/denied", (_req, res) => {
      void res.inertiaError(403, "No access for you");
    });
    const r = await request(app).get("/denied");
    expect(r.status).toBe(403);
    expect(r.text).toContain("No access for you");
  });

  it("falls back to standalone HTML when the Inertia render throws", async () => {
    const app = buildApp({
      sharedProps: () => {
        throw new Error("render boom");
      },
    });
    app.get("/boom", (_req, res) => {
      void res.inertiaError(500);
    });
    const r = await request(app).get("/boom").set("x-inertia", "true");
    expect(r.status).toBe(500);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    expect(r.text).toContain("<h1>500</h1>");
    expect(r.text).toContain("Server Error");
  });
});

describe("flashFromSession", () => {
  function appWithSession(session: Record<string, unknown>, opts: Parameters<typeof inertia>[0]) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { session: Record<string, unknown> }).session = session;
      next();
    });
    app.use(inertia(opts));
    return app;
  }

  it("merges session errors into props and surfaces flash as a top-level page key", async () => {
    const app = appWithSession({ errors: { name: "required" }, flash: "saved" }, { flashFromSession: true });
    app.get("/", (_req, res) => void res.inertia("X", {}));
    const r = await request(app).get("/").set("x-inertia", "true");
    const body = JSON.parse(r.text);
    expect(body.props.errors).toEqual({ name: "required" });
    // Flash is a sibling of `props`, never a prop (matches inertia-laravel).
    expect(body.flash).toBe("saved");
    expect(body.props.flash).toBeUndefined();
  });

  it("clears session flash data after reading (read-once)", async () => {
    const session: Record<string, unknown> = { errors: { e: 1 }, flash: "x" };
    const app = appWithSession(session, { flashFromSession: true });
    app.get("/", (_req, res) => void res.inertia("X", {}));
    await request(app).get("/").set("x-inertia", "true");
    expect(session.errors).toBeUndefined();
    expect(session.flash).toBeUndefined();
  });

  it("keeps session flash (top-level) and an explicit `flash` shared prop independent", async () => {
    const app = appWithSession(
      { flash: "from-session" },
      { flashFromSession: true, sharedProps: () => ({ flash: "from-shared" }) },
    );
    app.get("/", (_req, res) => void res.inertia("X", {}));
    const r = await request(app).get("/").set("x-inertia", "true");
    const body = JSON.parse(r.text);
    // No collision: session flash lands top-level, a same-named prop stays a prop.
    expect(body.flash).toBe("from-session");
    expect(body.props.flash).toBe("from-shared");
  });

  it("defaults errors to {} and omits the flash key when the session is empty", async () => {
    const app = appWithSession({}, { flashFromSession: true });
    app.get("/", (_req, res) => void res.inertia("X", {}));
    const r = await request(app).get("/").set("x-inertia", "true");
    const body = JSON.parse(r.text);
    expect(body.props.errors).toEqual({});
    expect(body.props.flash).toBeUndefined();
    expect("flash" in body).toBe(false);
  });

  it("does not inject errors/flash when flashFromSession is off", async () => {
    const app = appWithSession({ errors: { e: 1 }, flash: "x" }, {});
    app.get("/", (_req, res) => void res.inertia("X", { a: 1 }));
    const r = await request(app).get("/").set("x-inertia", "true");
    expect(JSON.parse(r.text).props).toEqual({ a: 1 });
  });

  it("picks up res.locals.inertiaErrors when no session errors exist", async () => {
    const app = appWithSession({}, { flashFromSession: true });
    app.get("/", (_req, res) => {
      res.locals.inertiaErrors = { email: "invalid" };
      void res.inertia("X", {});
    });
    const r = await request(app).get("/").set("x-inertia", "true");
    expect(JSON.parse(r.text).props.errors).toEqual({ email: "invalid" });
  });

  it("does not crash when session.errors is a non-object and passes it through as-is", async () => {
    const app = appWithSession({ errors: "some error" }, { flashFromSession: true });
    app.get("/", (_req, res) => void res.inertia("X", {}));
    const r = await request(app).get("/").set("x-inertia", "true");
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text).props.errors).toBe("some error");
  });

  it("inertiaFlash integrates with flashFromSession: flash appears then is cleared", async () => {
    const session: Record<string, unknown> = {};
    const app = appWithSession(session, { flashFromSession: true });
    // POST route sets flash via the helper.
    app.post("/submit", (_req, res) => {
      res.inertiaFlash({ notice: "Profile updated" });
      res.status(204).end();
    });
    app.get("/", (_req, res) => void res.inertia("Home", {}));

    // POST — sets session.flash.
    await request(app).post("/submit");
    expect(session.flash).toEqual({ notice: "Profile updated" });

    // GET — flash surfaced as a top-level page key, then cleared (read-once).
    const r = await request(app).get("/").set("x-inertia", "true");
    expect(JSON.parse(r.text).flash).toEqual({ notice: "Profile updated" });
    expect(session.flash).toBeUndefined();
  });
});

describe("req.flash (connect-flash compat)", () => {
  function appWithSession(session: Record<string, unknown>, opts: Parameters<typeof inertia>[0] = {}) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { session: Record<string, unknown> }).session = session;
      next();
    });
    app.use(inertia(opts));
    return app;
  }

  it("setter appends a message and returns the new bucket length", async () => {
    const session: Record<string, unknown> = {};
    const app = appWithSession(session);
    let count: number | undefined;
    app.get("/", (req, res) => {
      count = req.flash("info", "Welcome");
      res.status(204).end();
    });
    await request(app).get("/");
    expect(count).toBe(1);
    expect(session.flash).toEqual({ info: ["Welcome"] });
  });

  it("setter accumulates across calls of the same type", async () => {
    const session: Record<string, unknown> = {};
    const app = appWithSession(session);
    let lastCount: number | undefined;
    app.get("/", (req, res) => {
      req.flash("info", "first");
      lastCount = req.flash("info", "second");
      res.status(204).end();
    });
    await request(app).get("/");
    expect(lastCount).toBe(2);
    expect(session.flash).toEqual({ info: ["first", "second"] });
  });

  it("setter accepts an array of messages", async () => {
    const session: Record<string, unknown> = {};
    const app = appWithSession(session);
    let count: number | undefined;
    app.get("/", (req, res) => {
      count = req.flash("error", ["a", "b", "c"]);
      res.status(204).end();
    });
    await request(app).get("/");
    expect(count).toBe(3);
    expect(session.flash).toEqual({ error: ["a", "b", "c"] });
  });

  it("setter interpolates util.format placeholders", async () => {
    const session: Record<string, unknown> = {};
    const app = appWithSession(session);
    app.get("/", (req, res) => {
      req.flash("info", "Hello %s, you have %d messages", "Ada", 3);
      res.status(204).end();
    });
    await request(app).get("/");
    expect(session.flash).toEqual({ info: ["Hello Ada, you have 3 messages"] });
  });

  it("getter for one type returns and clears that bucket", async () => {
    const session: Record<string, unknown> = { flash: { info: ["one", "two"], error: ["x"] } };
    const app = appWithSession(session);
    let got: string[] | undefined;
    app.get("/", (req, res) => {
      got = req.flash("info");
      res.status(204).end();
    });
    await request(app).get("/");
    expect(got).toEqual(["one", "two"]);
    expect(session.flash).toEqual({ error: ["x"] });
  });

  it("getter for a missing type returns an empty array", async () => {
    const session: Record<string, unknown> = {};
    const app = appWithSession(session);
    let got: string[] | undefined;
    app.get("/", (req, res) => {
      got = req.flash("nope");
      res.status(204).end();
    });
    await request(app).get("/");
    expect(got).toEqual([]);
  });

  it("getter with no args returns and clears every bucket", async () => {
    const session: Record<string, unknown> = { flash: { info: ["i"], error: ["e"] } };
    const app = appWithSession(session);
    let got: Record<string, string[]> | undefined;
    app.get("/", (req, res) => {
      got = req.flash();
      res.status(204).end();
    });
    await request(app).get("/");
    expect(got).toEqual({ info: ["i"], error: ["e"] });
    expect(session.flash).toEqual({});
  });

  it("throws when no session is wired (connect-flash parity)", async () => {
    const app = express();
    app.use(inertia());
    let thrown: Error | undefined;
    app.get("/", (req, res, next) => {
      try {
        req.flash("info", "x");
      } catch (err) {
        thrown = err as Error;
      }
      res.status(204).end();
      next();
    });
    await request(app).get("/");
    expect(thrown?.message).toBe("req.flash() requires sessions");
  });

  it("connect-flash setter feeds the top-level flash key via flashFromSession", async () => {
    const session: Record<string, unknown> = {};
    const app = appWithSession(session, { flashFromSession: true });
    app.post("/submit", (req, res) => {
      req.flash("success", "Saved!");
      res.status(204).end();
    });
    app.get("/", (_req, res) => void res.inertia("Home", {}));

    await request(app).post("/submit");
    expect(session.flash).toEqual({ success: ["Saved!"] });

    const r = await request(app).get("/").set("x-inertia", "true");
    expect(JSON.parse(r.text).flash).toEqual({ success: ["Saved!"] });
    expect(session.flash).toBeUndefined();
  });
});
