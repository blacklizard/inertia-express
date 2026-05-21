import { createInertiaSsrWorker } from "@blacklizard/inertia-ssr-worker";

// In production, import the built SSR bundle. In dev, tsx will resolve the
// source path. The bundle exports `render(page) -> { head, body }`.
const ssrEntry = process.env.NODE_ENV === "production" ? "../dist/server/ssr.js" : "../client/ssr.ts";

const mod = (await import(ssrEntry)) as {
  render: (page: unknown) => Promise<{ head: string[]; body: string }>;
};

createInertiaSsrWorker({
  port: Number(process.env.SSR_PORT ?? 13714),
  host: process.env.SSR_HOST ?? "0.0.0.0",
  maxRequests: Number(process.env.SSR_MAX_REQUESTS ?? 1000),
  maxLifetimeSec: Number(process.env.SSR_MAX_LIFETIME_SEC ?? 3600),
  maxRssMb: Number(process.env.SSR_MAX_RSS_MB ?? 512),
  async render(page) {
    const result = await mod.render(page);
    // `@inertiajs/vue3` returns the entire root element including data-page.
    return { ...result, bodyIsFullRoot: true };
  },
  onRecycle: (reason) => {
    console.log(`[ssr] recycling: ${reason}`);
  },
});
