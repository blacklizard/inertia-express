import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { prerender } from "../../src/express/prerender.js";

function tmp() {
  return mkdtempSync(join(tmpdir(), "inertia-prerender-"));
}

function fakeFetch(routes: Record<string, { status: number; body: string }>) {
  return vi.fn(async (url: string | URL) => {
    const u = typeof url === "string" ? new URL(url) : url;
    const path = u.pathname;
    const r = routes[path];
    if (!r) {
      return new Response("missing", { status: 404 });
    }
    return new Response(r.body, { status: r.status });
  }) as unknown as typeof fetch;
}

describe("prerender", () => {
  it("warmup mode hits each route and reports counts", async () => {
    const fetcher = fakeFetch({
      "/": { status: 200, body: "<p>home</p>" },
      "/about": { status: 200, body: "<p>about</p>" },
    });
    const summary = await prerender({
      baseUrl: "http://x",
      routes: ["/", "/about"],
      fetch: fetcher,
    });
    expect(summary.ok).toBe(2);
    expect(summary.failed).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("static mode writes HTML to disk", async () => {
    const dir = tmp();
    const fetcher = fakeFetch({
      "/": { status: 200, body: "<p>home</p>" },
      "/users": { status: 200, body: "<p>users</p>" },
    });
    const summary = await prerender({
      baseUrl: "http://x",
      routes: ["/", "/users"],
      mode: "static",
      outDir: dir,
      fetch: fetcher,
    });
    expect(summary.ok).toBe(2);
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(readFileSync(join(dir, "index.html"), "utf8")).toBe("<p>home</p>");
    expect(readFileSync(join(dir, "users", "index.html"), "utf8")).toBe("<p>users</p>");
  });

  it("counts non-2xx as failed", async () => {
    const fetcher = fakeFetch({
      "/": { status: 200, body: "" },
      "/missing": { status: 404, body: "" },
    });
    const summary = await prerender({
      baseUrl: "http://x",
      routes: ["/", "/missing"],
      fetch: fetcher,
    });
    expect(summary.ok).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it("respects concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const fetcher = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    await prerender({
      baseUrl: "http://x",
      routes: Array.from({ length: 10 }, (_, i) => `/r${i}`),
      concurrency: 3,
      fetch: fetcher,
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("captures error per route without halting", async () => {
    const fetcher = vi.fn(async (url) => {
      if (String(url).includes("/bad")) {
        throw new Error("boom");
      }
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const summary = await prerender({
      baseUrl: "http://x",
      routes: ["/", "/bad", "/ok"],
      fetch: fetcher,
    });
    expect(summary.ok).toBe(2);
    expect(summary.failed).toBe(1);
    const failed = summary.results.find((r) => r.error);
    expect(failed?.error).toBe("boom");
  });

  it("forwards custom headers to fetch", async () => {
    let seenHeaders: Record<string, string> | undefined;
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      seenHeaders = init?.headers as Record<string, string>;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    await prerender({
      baseUrl: "http://x",
      routes: ["/"],
      headers: { Authorization: "Bearer t", "X-AB-Bucket": "b1" },
      fetch: fetcher,
    });
    expect(seenHeaders).toMatchObject({
      Accept: "text/html",
      Authorization: "Bearer t",
      "X-AB-Bucket": "b1",
    });
  });

  it("reports an error when static mode is selected without outDir", async () => {
    const fetcher = fakeFetch({ "/": { status: 200, body: "ok" } });
    const summary = await prerender({
      baseUrl: "http://x",
      routes: ["/"],
      mode: "static",
      fetch: fetcher,
    });
    expect(summary.failed).toBe(1);
    expect(summary.results[0]?.error).toMatch(/outDir is required/);
  });

  it("both mode fetches routes and writes HTML to disk", async () => {
    const dir = tmp();
    const fetcher = fakeFetch({
      "/": { status: 200, body: "<p>home</p>" },
      "/about": { status: 200, body: "<p>about</p>" },
    });
    const summary = await prerender({
      baseUrl: "http://x",
      routes: ["/", "/about"],
      mode: "both",
      outDir: dir,
      fetch: fetcher,
    });
    expect(summary.ok).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(readFileSync(join(dir, "index.html"), "utf8")).toBe("<p>home</p>");
    expect(readFileSync(join(dir, "about", "index.html"), "utf8")).toBe("<p>about</p>");
  });

  it("returns zero counts for an empty routes array", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const summary = await prerender({
      baseUrl: "http://x",
      routes: [],
      fetch: fetcher,
    });
    expect(summary).toEqual({ total: 0, ok: 0, failed: 0, results: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("static mode with query-string route strips query string from output path", async () => {
    const dir = tmp();
    const fetcher = vi.fn(async () => {
      return new Response("<p>users page 2</p>", { status: 200 });
    }) as unknown as typeof fetch;
    const summary = await prerender({
      baseUrl: "http://x",
      routes: ["/users?page=2"],
      mode: "static",
      outDir: dir,
      fetch: fetcher,
    });
    // routeToFile extracts the pathname only, so /users?page=2 writes to
    // <outDir>/users/index.html — the path nginx actually looks up.
    expect(summary.ok).toBe(1);
    const expectedPath = join(dir, "users", "index.html");
    expect(existsSync(expectedPath)).toBe(true);
    expect(readFileSync(expectedPath, "utf8")).toBe("<p>users page 2</p>");
    // The bad path must not exist.
    expect(existsSync(join(dir, "users?page=2", "index.html"))).toBe(false);
  });

  it("handles a route with a query string in warmup mode", async () => {
    let fetchedUrl: string | undefined;
    const fetcher = vi.fn(async (url: string | URL) => {
      fetchedUrl = typeof url === "string" ? url : url.toString();
      return new Response("<p>users</p>", { status: 200 });
    }) as unknown as typeof fetch;
    const summary = await prerender({
      baseUrl: "http://x",
      routes: ["/users?page=2"],
      fetch: fetcher,
    });
    expect(summary.ok).toBe(1);
    expect(fetchedUrl).toBe("http://x/users?page=2");
  });

  it("aborts via AbortController when timeoutMs elapses", async () => {
    const fetcher = vi.fn((_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;
    const summary = await prerender({
      baseUrl: "http://x",
      routes: ["/slow"],
      timeoutMs: 50,
      fetch: fetcher,
    });
    expect(summary.ok).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.results[0]?.status).toBeNull();
    expect(summary.results[0]?.error).toBeTruthy();
  });
});
