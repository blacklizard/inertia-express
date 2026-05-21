import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { sendInertiaLocation, sendInertiaResponse } from "../../src/express/response.js";

describe("sendInertiaLocation (no middleware)", () => {
  it("parses headers itself when req.inertia is absent (Inertia branch)", async () => {
    const app = express();
    app.get("/", (req, res) => {
      sendInertiaLocation(req, res, "/elsewhere");
    });
    const r = await request(app).get("/").set("x-inertia", "true");
    expect(r.status).toBe(409);
    expect(r.headers["x-inertia-location"]).toBe("/elsewhere");
  });

  it("falls back to 302 for browser visits when req.inertia is absent", async () => {
    const app = express();
    app.get("/", (req, res) => {
      sendInertiaLocation(req, res, "/elsewhere");
    });
    const r = await request(app).get("/").redirects(0);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("/elsewhere");
  });
});

describe("sendInertiaResponse (no middleware)", () => {
  it("parses headers itself when req.inertia is absent and renders HTML", async () => {
    const app = express();
    app.get("/", async (req, res) => {
      await sendInertiaResponse(req, res, { options: {} }, "Home", { a: 1 });
    });
    const r = await request(app).get("/");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    expect(r.text).toContain("data-page=");
  });

  it("returns Inertia JSON when x-inertia is set even without middleware", async () => {
    const app = express();
    app.get("/users", async (req, res) => {
      await sendInertiaResponse(req, res, { options: {} }, "Users/Index", { count: 1 });
    });
    const r = await request(app).get("/users").set("x-inertia", "true");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/application\/json/);
    const body = JSON.parse(r.text);
    expect(body.component).toBe("Users/Index");
    expect(body.url).toBe("/users");
  });

  it("honors options.url to override req.url in the page", async () => {
    const app = express();
    app.get("/internal", async (req, res) => {
      await sendInertiaResponse(req, res, { options: {} }, "X", {}, { url: "/public" });
    });
    const r = await request(app).get("/internal").set("x-inertia", "true");
    const body = JSON.parse(r.text);
    expect(body.url).toBe("/public");
  });
});
