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

// L1 in-process cache. Sized small — Redis is the source of truth.
const memoryStore = createMemoryCacheStore({ max: 200 });

// L2 Redis cache (optional — falls back to memory only if REDIS_URL unset).
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

const ssrFetcher = createInertiaSsrFetcher({
  url: SSR_URL,
  timeoutMs: 5000,
  retries: 2,
  breakerThreshold: 5,
  breakerCooldownMs: 30000,
  fallback: "client",
});

app.use(
  inertia({
    version: viteManifestVersion({ manifestPath: MANIFEST_PATH }),
    sharedProps: () => ({
      auth: { user: { name: "Demo User" } },
    }),
    ssr: ssrFetcher,
    cache: {
      // For multi-pod web tier, use redisStore. For single instance, memoryStore.
      store: redisStore ?? memoryStore,
      ttlSeconds: 600,
      onError: (op, err) => console.warn(`[cache] ${op} failed`, err),
    },
    // Edge-cache the home page for 60s (CDN), 0s (browser). Opt-in per route.
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
      const root = ssr.bodyIsFullRoot ? ssr.body : `<div id="app">${ssr.body}</div>${pageScript}`;
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inertia Vue Prod Example</title>
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
  await res.inertia("Home", {
    greeting: "Hello from production-ready Inertia + Vue",
  });
});

app.get("/about", async (_req, res) => {
  await res.inertia("About", { team: ["alice", "bob"] });
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.listen(PORT, () => {
  console.log(`web: http://0.0.0.0:${PORT}  (ssr: ${SSR_URL})`);
});
