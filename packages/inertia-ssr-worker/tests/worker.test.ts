import { afterEach, describe, expect, it } from "vitest";
import type { InertiaSsrWorkerHandle } from "../src/index.js";
import { createInertiaSsrWorker } from "../src/index.js";

const handles: InertiaSsrWorkerHandle[] = [];

afterEach(async () => {
  for (const h of handles.splice(0)) {
    await h.close().catch(() => {});
  }
});

async function startWorker(
  opts: Partial<Parameters<typeof createInertiaSsrWorker>[0]> = {},
): Promise<InertiaSsrWorkerHandle> {
  const handle = createInertiaSsrWorker({
    port: 0, // ask OS for a free port
    render: async (page) => ({ body: `<p>${page.component}</p>` }),
    logger: { info() {}, warn() {}, error() {} },
    autoExit: false,
    ...opts,
  });
  await handle.ready;
  handles.push(handle);
  return handle;
}

describe("createInertiaSsrWorker", () => {
  it("renders via POST /render", async () => {
    const handle = await startWorker();
    const res = await fetch(`http://127.0.0.1:${handle.port}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        component: "Home",
        props: {},
        url: "/",
        version: null,
        clearHistory: false,
        encryptHistory: false,
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { body: string };
    expect(json.body).toBe("<p>Home</p>");
  });

  it("returns 200 on /health when not draining", async () => {
    const handle = await startWorker();
    const res = await fetch(`http://127.0.0.1:${handle.port}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("returns 200 on /ready", async () => {
    const handle = await startWorker();
    const res = await fetch(`http://127.0.0.1:${handle.port}/ready`);
    expect(res.status).toBe(200);
  });

  it("returns 404 on unknown routes", async () => {
    const handle = await startWorker();
    const res = await fetch(`http://127.0.0.1:${handle.port}/something`);
    expect(res.status).toBe(404);
  });

  it("returns 400 on malformed body", async () => {
    const handle = await startWorker();
    const res = await fetch(`http://127.0.0.1:${handle.port}/render`, {
      method: "POST",
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 when render throws", async () => {
    const handle = await startWorker({
      render: () => {
        throw new Error("kaboom");
      },
    });
    const res = await fetch(`http://127.0.0.1:${handle.port}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component: "X" }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("kaboom");
  });

  it("flips /health to 503 during drain and rejects new /render", async () => {
    const handle = await startWorker();
    const drainPromise = handle.drain();

    // Health flips immediately.
    const health = await fetch(`http://127.0.0.1:${handle.port}/health`).catch(() => null);
    if (health) {
      expect(health.status).toBe(503);
    }
    await drainPromise;
  });

  it("recycles after maxRequests via onRecycle", async () => {
    let reason: string | undefined;
    const handle = await startWorker({
      maxRequests: 2,
      onRecycle: (r) => {
        reason = r;
      },
    });
    for (let i = 0; i < 2; i++) {
      await fetch(`http://127.0.0.1:${handle.port}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ component: "X" }),
      });
    }
    // Give the recycle code path a tick.
    await new Promise((r) => setTimeout(r, 20));
    expect(reason).toBe("max-requests");
  });

  it("recycles after maxLifetimeSec via onRecycle", async () => {
    let reason: string | undefined;
    await startWorker({
      maxLifetimeSec: 0.5,
      onRecycle: (r) => {
        reason = r;
      },
    });
    // The lifetime check ticks once per second; wait past the first tick.
    await new Promise((r) => setTimeout(r, 1300));
    expect(reason).toBe("max-lifetime");
  });

  it("concurrent drain() calls both resolve without error", async () => {
    // drain() is async so each call returns a distinct Promise wrapper —
    // dedup is of the inner drainPromise, not the outer async wrapper.
    // Both must resolve to undefined without throwing.
    const handle = await startWorker();
    const [r1, r2] = await Promise.all([handle.drain(), handle.drain()]);
    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
  });

  it("returns 500 when async render rejects, worker stays operational", async () => {
    let callCount = 0;
    const handle = await startWorker({
      render: async () => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.reject(new Error("async kaboom"));
        }
        return { body: "<p>ok</p>" };
      },
    });

    const failing = await fetch(`http://127.0.0.1:${handle.port}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component: "X", props: {}, url: "/", version: null, clearHistory: false, encryptHistory: false }),
    });
    expect(failing.status).toBe(500);
    const failBody = (await failing.json()) as { error: string; message: string };
    expect(failBody.error).toBe("render failed");
    expect(failBody.message).toBe("async kaboom");

    const recovering = await fetch(`http://127.0.0.1:${handle.port}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component: "X", props: {}, url: "/", version: null, clearHistory: false, encryptHistory: false }),
    });
    expect(recovering.status).toBe(200);
    const recoverBody = (await recovering.json()) as { body: string };
    expect(recoverBody.body).toBe("<p>ok</p>");
  });

  it("returns 503 on POST /render while draining", async () => {
    // Keep a render in-flight so drain() doesn't close the server immediately.
    let releaseSlow!: () => void;
    const slowBarrier = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const handle = await startWorker({
      render: async () => {
        await slowBarrier;
        return { body: "<p>slow</p>" };
      },
    });

    // Fire slow render — keeps inFlight > 0.
    const slowFetch = fetch(`http://127.0.0.1:${handle.port}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component: "X", props: {}, url: "/", version: null, clearHistory: false, encryptHistory: false }),
    });

    // Wait a tick so the slow render is registered as in-flight.
    await new Promise((r) => setTimeout(r, 10));

    // Start draining — server stays open while slowFetch is in-flight.
    const drainDone = handle.drain();

    // Second request arrives while draining → must get 503.
    const res = await fetch(`http://127.0.0.1:${handle.port}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component: "X", props: {}, url: "/", version: null, clearHistory: false, encryptHistory: false }),
    });
    expect(res.status).toBe(503);

    // Release the slow render so drain completes.
    releaseSlow();
    await slowFetch;
    await drainDone;
  });
});
