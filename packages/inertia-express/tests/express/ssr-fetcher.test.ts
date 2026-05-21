import { describe, expect, it, vi } from "vitest";
import { createInertiaSsrFetcher } from "../../src/express/ssr-fetcher.js";

function fakePage() {
  return {
    component: "X",
    props: {},
    url: "/",
    version: null,
    clearHistory: false,
    encryptHistory: false,
  };
}

function fakeReqRes() {
  return { req: {} as never, res: {} as never };
}

describe("createInertiaSsrFetcher", () => {
  it("posts page JSON and returns parsed result", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ body: "<p>ok</p>", head: "<title>t</title>" }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    const fetcher = createInertiaSsrFetcher({ url: "http://x/render", fetch: fetchImpl });
    const result = await fetcher({ page: fakePage(), ...fakeReqRes() });
    expect(result?.body).toBe("<p>ok</p>");
    expect(result?.head).toBe("<title>t</title>");
  });

  it("retries on transient failure then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response("fail", { status: 500 });
      }
      return new Response(JSON.stringify({ body: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;
    const fetcher = createInertiaSsrFetcher({
      url: "http://x/render",
      fetch: fetchImpl,
      retries: 3,
      retryBaseMs: 1,
    });
    const result = await fetcher({ page: fakePage(), ...fakeReqRes() });
    expect(result?.body).toBe("ok");
    expect(calls).toBe(3);
  });

  it("falls back to empty result after exhausting retries", async () => {
    const fetchImpl = vi.fn(async () => new Response("fail", { status: 500 })) as unknown as typeof fetch;
    const fetcher = createInertiaSsrFetcher({
      url: "http://x/render",
      fetch: fetchImpl,
      retries: 1,
      retryBaseMs: 1,
    });
    const result = await fetcher({ page: fakePage(), ...fakeReqRes() });
    expect(result).toEqual({ body: "", head: "" });
  });

  it("rethrows when fallback is 'throw'", async () => {
    const fetchImpl = vi.fn(async () => new Response("fail", { status: 500 })) as unknown as typeof fetch;
    const fetcher = createInertiaSsrFetcher({
      url: "http://x/render",
      fetch: fetchImpl,
      retries: 0,
      fallback: "throw",
    });
    await expect(fetcher({ page: fakePage(), ...fakeReqRes() })).rejects.toThrow(/Inertia SSR/);
  });

  it("opens circuit breaker after threshold and short-circuits", async () => {
    const fetchImpl = vi.fn(async () => new Response("fail", { status: 500 })) as unknown as typeof fetch;
    const fetcher = createInertiaSsrFetcher({
      url: "http://x/render",
      fetch: fetchImpl,
      retries: 0,
      breakerThreshold: 2,
      breakerCooldownMs: 10000,
    });
    // First two failures move breaker towards open (it opens AFTER the 2nd
    // recordFailure, since 2 >= threshold).
    await fetcher({ page: fakePage(), ...fakeReqRes() });
    await fetcher({ page: fakePage(), ...fakeReqRes() });
    const callsBefore = fetchImpl.mock.calls.length;
    // Next call should NOT call fetch — breaker is open.
    await fetcher({ page: fakePage(), ...fakeReqRes() });
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  it("throws when breaker is open and fallback is 'throw'", async () => {
    const fetchImpl = vi.fn(async () => new Response("fail", { status: 500 })) as unknown as typeof fetch;
    const fetcher = createInertiaSsrFetcher({
      url: "http://x/render",
      fetch: fetchImpl,
      retries: 0,
      breakerThreshold: 1,
      breakerCooldownMs: 10000,
      fallback: "throw",
    });
    await expect(fetcher({ page: fakePage(), ...fakeReqRes() })).rejects.toThrow();
    const callsBefore = fetchImpl.mock.calls.length;
    await expect(fetcher({ page: fakePage(), ...fakeReqRes() })).rejects.toThrow(/circuit breaker/);
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  it("half-opens after cooldown so one probe can re-close it", async () => {
    let mode: "fail" | "ok" = "fail";
    const fetchImpl = vi.fn(async () => {
      if (mode === "fail") {
        return new Response("nope", { status: 500 });
      }
      return new Response(JSON.stringify({ body: "back" }), { status: 200 });
    }) as unknown as typeof fetch;
    vi.useFakeTimers();
    try {
      const fetcher = createInertiaSsrFetcher({
        url: "http://x/render",
        fetch: fetchImpl,
        retries: 0,
        breakerThreshold: 1,
        breakerCooldownMs: 5_000,
      });
      await fetcher({ page: fakePage(), ...fakeReqRes() });
      const tripped = fetchImpl.mock.calls.length;
      await fetcher({ page: fakePage(), ...fakeReqRes() });
      expect(fetchImpl.mock.calls.length).toBe(tripped);
      vi.advanceTimersByTime(6_000);
      mode = "ok";
      const result = await fetcher({ page: fakePage(), ...fakeReqRes() });
      expect(fetchImpl.mock.calls.length).toBe(tripped + 1);
      expect(result?.body).toBe("back");
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables breaker when threshold is 0", async () => {
    const fetchImpl = vi.fn(async () => new Response("fail", { status: 500 })) as unknown as typeof fetch;
    const fetcher = createInertiaSsrFetcher({
      url: "http://x/render",
      fetch: fetchImpl,
      retries: 0,
      breakerThreshold: 0,
    });
    for (let i = 0; i < 5; i++) {
      await fetcher({ page: fakePage(), ...fakeReqRes() });
    }
    expect(fetchImpl.mock.calls.length).toBe(5);
  });

  it("returns empty result when SSR response body is malformed JSON", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("not-json{{", { status: 200 }),
    ) as unknown as typeof fetch;
    const fetcher = createInertiaSsrFetcher({
      url: "http://x/render",
      fetch: fetchImpl,
      retries: 1,
      retryBaseMs: 1,
      fallback: "client",
    });
    const result = await fetcher({ page: fakePage(), ...fakeReqRes() });
    expect(result).toEqual({ body: "", head: "" });
    expect(fetchImpl.mock.calls.length).toBe(2);
  });

  it("sends custom headers on every request", async () => {
    const capturedHeaders: HeadersInit[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders.push(init?.headers ?? {});
      return new Response(JSON.stringify({ body: "<p>ok</p>", head: "" }), { status: 200 });
    }) as unknown as typeof fetch;
    const fetcher = createInertiaSsrFetcher({
      url: "http://x/render",
      fetch: fetchImpl,
      headers: { "X-Custom": "value", "X-Tenant": "acme" },
    });
    await fetcher({ page: fakePage(), ...fakeReqRes() });
    const sent = capturedHeaders[0] as Record<string, string>;
    expect(sent["X-Custom"]).toBe("value");
    expect(sent["X-Tenant"]).toBe("acme");
    expect(sent["Content-Type"]).toBe("application/json");
  });
});
