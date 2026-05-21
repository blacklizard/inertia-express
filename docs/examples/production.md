# Production Example (Vue + SSR + Redis)

Full production-grade setup with SSR, Redis view cache, memory L1 cache, edge caching, and out-of-process SSR worker.

Full source: [`examples/express-vue-prod/`](https://github.com/blacklizard/inertia-express/tree/main/examples/express-vue-prod)

## Architecture

```
Browser
  │
  ▼
CDN (edge cache — public pages)
  │
  ▼
Web process (Express)
  ├── L1: in-process memory cache  (fast path for single-pod)
  ├── L2: Redis cache              (shared across pods)
  │
  ▼ (cache miss)
SSR worker (separate process, port 13714)
  └── Vue 3 renderToString
```

## Web server

```ts
// server/index.ts
import { createRedisCacheStore } from "@blacklizard/inertia-cache-redis";
import {
  createInertiaSsrFetcher,
  createMemoryCacheStore,
  inertia,
  viteManifestVersion,
} from "@blacklizard/inertia-express";
import express from "express";
import { createClient } from "redis";

const PORT = Number(process.env.PORT ?? 3000);
const SSR_URL = process.env.SSR_URL ?? "http://127.0.0.1:13714/render";
const REDIS_URL = process.env.REDIS_URL;
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "./dist/client/.vite/manifest.json";

const app = express();
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/assets", express.static("dist/client/assets", { immutable: true, maxAge: "1y" }));

// L1: In-process LRU cache
const memoryStore = createMemoryCacheStore({ max: 200 });

// L2: Redis (optional — falls back to memory-only if REDIS_URL not set)
let redisStore = null;
if (REDIS_URL) {
  const client = createClient({ url: REDIS_URL });
  client.on("error", (err) => console.warn("[redis] error", err));
  await client.connect();
  redisStore = createRedisCacheStore({
    client,
    keyPrefix: process.env.CACHE_PREFIX ?? "inertia",
    onError: (op, err) => console.warn(`[redis] cache ${op} failed`, err),
  });
}

// SSR fetcher — HTTP client with circuit breaker
const ssrFetcher = createInertiaSsrFetcher({
  url: SSR_URL,
  timeoutMs: 5000,
  retries: 2,
  breakerThreshold: 5,
  breakerCooldownMs: 30_000,
  fallback: "client", // client-only rendering on SSR failure
});

app.use(
  inertia({
    // Version from Vite manifest — retires cache on every deploy
    version: viteManifestVersion({ manifestPath: MANIFEST_PATH }),

    sharedProps: () => ({
      auth: { user: { name: "Demo User" } },
    }),

    // SSR via out-of-process worker
    ssr: ssrFetcher,

    // View cache — Redis when available, memory otherwise
    cache: {
      store: redisStore ?? memoryStore,
      ttlSeconds: 600,
      onError: (op, err) => console.warn(`[cache] ${op} failed`, err),
    },

    // CDN edge cache for public pages
    edgeCache: ({ page }) => {
      if (page.url === "/") {
        return { sMaxAge: 60, staleWhileRevalidate: 30 };
      }
      return null;
    },

    rootView: ({ res, page }) => {
      const ssr = (res.locals.ssr ?? { head: "", body: "" }) as {
        head: string | string[];
        body: string;
        bodyIsFullRoot?: boolean;
      };
      const head = Array.isArray(ssr.head) ? ssr.head.join("") : (ssr.head ?? "");
      const pageScript = `<script data-page="app" type="application/json">${JSON.stringify(page).replace(/</g, "\\u003C")}</script>`;
      const root = ssr.bodyIsFullRoot
        ? ssr.body
        : `<div id="app">${ssr.body}</div>${pageScript}`;

      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My App</title>
    ${head}
  </head>
  <body>
    ${root}
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>`;
    },
  }),
);

app.get("/", async (_req, res) => {
  await res.inertia("Home", { greeting: "Hello from production-ready Inertia" });
});

app.get("/about", async (_req, res) => {
  await res.inertia("About", { team: ["alice", "bob"] });
});

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.listen(PORT, () => console.log(`web: http://0.0.0.0:${PORT}`));
```

## SSR worker

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
        const pages = import.meta.glob("../client/pages/**/*.vue", { eager: true });
        return pages[`../client/pages/${name}.vue`] as object;
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
  maxLifetimeSec: 3600,
  maxRssMb: 512,
});
```

## Vite config

```ts
// vite.config.ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "dist/client",
    rollupOptions: {
      input: { main: "client/main.ts" },
    },
  },
  ssr: {
    noExternal: ["@inertiajs/vue3"],
  },
});
```

## Build and run

```bash
# Build client and SSR bundles
pnpm vite build
pnpm vite build --ssr ssr/index.ts --outDir dist/ssr

# Start SSR worker
node dist/ssr/index.js &

# Start web server
node dist/server/index.js
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Web server port |
| `SSR_URL` | `http://127.0.0.1:13714/render` | SSR worker URL |
| `SSR_PORT` | `13714` | SSR worker listen port |
| `REDIS_URL` | — | Redis connection URL. Omit for memory-only cache. |
| `CACHE_PREFIX` | `inertia` | Redis key prefix |
| `MANIFEST_PATH` | `./dist/client/.vite/manifest.json` | Vite manifest path |
