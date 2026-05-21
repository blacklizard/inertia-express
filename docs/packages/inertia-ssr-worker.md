# @blacklizard/inertia-ssr-worker

Production SSR HTTP worker for `@blacklizard/inertia-express`.

Runs the SSR renderer in a separate process. The web server calls it over HTTP via `createInertiaSsrFetcher`. This isolates renderer crashes from the web process, enables independent scaling, and keeps memory usage predictable via auto-recycling.

## Install

```bash
pnpm add @blacklizard/inertia-ssr-worker
```

## Usage

```ts
// ssr/index.ts
import { createInertiaSsrWorker } from "@blacklizard/inertia-ssr-worker";

const worker = createInertiaSsrWorker({
  async render(page) {
    // Call your framework's SSR render function
    const { html, head } = await renderApp(page);
    return { body: html, head };
  },
  port: 13714,
  maxRequests: 1000,
  maxRssMb: 512,
});

await worker.ready;
console.log(`SSR worker listening on port ${worker.port}`);
```

## HTTP endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/render` | Render a page. Body: page JSON. Response: `{ head, body }`. Returns 503 when draining. |
| `GET` | `/health` | 200 healthy, 503 draining. |
| `GET` | `/ready` | 200 once the server is listening. |

## `createInertiaSsrWorker(options)`

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `render` | — | User render function. Receives the page object, returns `{ body, head?, bodyIsFullRoot? }`. |
| `port` | `13714` | Listen port. 13714 is the Inertia convention. |
| `host` | `0.0.0.0` | Listen host. |
| `maxRequests` | `1000` | Recycle the process after N `/render` requests. `0` disables. |
| `maxLifetimeSec` | `3600` | Recycle after N seconds of uptime. `0` disables. |
| `maxRssMb` | `512` | Recycle when RSS exceeds N MB. `0` disables. |
| `rssCheckIntervalMs` | `10000` | How often to check RSS. |
| `drainTimeoutMs` | `10000` | Max wait for in-flight requests to finish before forcing close. |
| `logger` | `console` | Logger with `info`, `warn`, `error` methods. |
| `onRecycle` | — | Called with `RecycleReason` when recycling starts. |
| `autoExit` | `true` | Call `process.exit(0)` after drain. Set `false` for tests. |

### `RecycleReason`

```ts
type RecycleReason = "max-requests" | "max-lifetime" | "max-rss";
```

## `InertiaSsrWorkerHandle`

The handle returned by `createInertiaSsrWorker`:

```ts
interface InertiaSsrWorkerHandle {
  port: number;              // Bound port
  ready: Promise<void>;      // Resolves when the server is listening
  isDraining(): boolean;     // True once graceful shutdown has started
  drain(): Promise<void>;    // Graceful shutdown — flips isDraining, waits up to drainTimeoutMs
  close(): Promise<void>;    // Stop accepting new connections via server.close() — no draining flag, no timeout
}
```

## Self-healing and recycling

The worker auto-recycles to prevent memory leaks in long-running renderers (e.g. Vue's `renderToString` can accumulate memory over thousands of requests).

When a recycle condition triggers:
1. Worker flips `/health` to `503` — load balancer stops routing new traffic
2. Worker drains in-flight `/render` requests (up to `drainTimeoutMs`)
3. Worker calls `process.exit(0)` (if `autoExit: true`)
4. Supervisor (PM2, systemd, Docker restart policy) starts a fresh process

## Graceful shutdown

The worker wires `SIGTERM` and `SIGINT` to the drain flow automatically:

```
SIGTERM/SIGINT → drain() → process.exit(0)
```

This integrates cleanly with:
- **Docker** — `docker stop` sends `SIGTERM`
- **Kubernetes** — graceful pod termination
- **PM2** — `pm2 reload` sends `SIGINT` then `SIGTERM`
- **systemd** — `ExecStop` sends `SIGTERM`

## Vue 3 SSR example

```ts
// ssr/index.ts
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { createInertiaApp } from "@inertiajs/vue3";
import { createInertiaSsrWorker } from "@blacklizard/inertia-ssr-worker";

createInertiaSsrWorker({
  async render(page) {
    let body = "";
    let head: string[] = [];

    await createInertiaApp({
      page,
      render: renderToString,
      resolve: (name) => {
        const pages = import.meta.glob("../pages/**/*.vue", { eager: true });
        return pages[`../pages/${name}.vue`] as object;
      },
      setup({ App, props, plugin }) {
        const app = createSSRApp({ render: () => h(App, props) });
        app.use(plugin);
        return app;
      },
    }).then(({ html, head: h }) => {
      body = html;
      head = h;
    });

    return { body, head };
  },
  port: Number(process.env.SSR_PORT ?? 13714),
  maxRequests: 1000,
  maxRssMb: 512,
});
```

## React SSR example

```ts
import { renderToString } from "react-dom/server";
import { createInertiaApp } from "@inertiajs/react";
import createServer from "@inertiajs/react/server";
import { createInertiaSsrWorker } from "@blacklizard/inertia-ssr-worker";

createInertiaSsrWorker({
  async render(page) {
    let body = "";

    await createInertiaApp({
      page,
      render: renderToString,
      resolve: (name) => {
        const pages = import.meta.glob("../pages/**/*.tsx", { eager: true });
        return pages[`../pages/${name}.tsx`] as object;
      },
    }).then(({ html }) => {
      body = html;
    });

    return { body };
  },
  port: 13714,
});
```

## Connecting the web server

Point `createInertiaSsrFetcher` at the worker:

```ts
import { createInertiaSsrFetcher, inertia } from "@blacklizard/inertia-express";

app.use(
  inertia({
    ssr: createInertiaSsrFetcher({
      url: `http://127.0.0.1:${process.env.SSR_PORT ?? 13714}/render`,
      timeoutMs: 5000,
      retries: 2,
      fallback: "client",
    }),
  }),
);
```
