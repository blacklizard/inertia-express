# inertia-express

[![CI](https://github.com/blacklizard/inertia-express/actions/workflows/ci.yml/badge.svg)](https://github.com/blacklizard/inertia-express/actions/workflows/ci.yml)
[![Conformance](https://github.com/blacklizard/inertia-express/actions/workflows/conformance.yml/badge.svg)](https://github.com/blacklizard/inertia-express/actions/workflows/conformance.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >= 24](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io)

Production-ready, TypeScript-first [Inertia.js v3](https://inertiajs.com) server adapter for Node.js and Express.

Inertia lets you build SPA-style frontends (Vue, React, Svelte) on classic server-side routing — no separate API to build or version. This is the Express server half.

## Features

- **Full Inertia v3 protocol** — partial reloads, deferred / merge / deep-merge props, history encryption. Verified against the official Inertia conformance suite.
- **SSR** — render in-process, or offload to an out-of-process worker pool with health checks and graceful drain.
- **Caching** — SSR view cache (in-memory or Redis) plus CDN edge-cache headers.
- **Prerendering** — warm the SSR cache after a deploy, or export routes to static HTML.
- **Flash & validation errors** — `connect-flash`-compatible `req.flash()`, plus `res.inertiaErrors()` / `res.inertiaFlash()`.
- **TypeScript-first** — typed `res.inertia()` and request augmentation. The protocol core is framework-agnostic (`@blacklizard/inertia-express/core`) for building adapters beyond Express.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@blacklizard/inertia-express`](packages/inertia-express) | [![npm](https://img.shields.io/npm/v/@blacklizard/inertia-express.svg)](https://www.npmjs.com/package/@blacklizard/inertia-express) | Core adapter — install this in every project |
| [`@blacklizard/inertia-ssr-worker`](packages/inertia-ssr-worker) | [![npm](https://img.shields.io/npm/v/@blacklizard/inertia-ssr-worker.svg)](https://www.npmjs.com/package/@blacklizard/inertia-ssr-worker) | Out-of-process SSR HTTP worker (optional) |
| [`@blacklizard/inertia-cache-redis`](packages/inertia-cache-redis) | [![npm](https://img.shields.io/npm/v/@blacklizard/inertia-cache-redis.svg)](https://www.npmjs.com/package/@blacklizard/inertia-cache-redis) | Redis-backed SSR view cache (optional) |

## Quick start

```bash
pnpm add @blacklizard/inertia-express express
```

```ts
import express from "express";
import { inertia } from "@blacklizard/inertia-express";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  inertia({
    version: () => process.env.ASSET_VERSION ?? null,
    sharedProps: (req) => ({
      auth: { user: req.user ?? null },
    }),
    // Auto-promote session flash + validation errors into page props.
    flashFromSession: true,
  }),
);

app.get("/users", async (req, res) => {
  await res.inertia("Users/Index", {
    users: await db.users.findMany(),
  });
});

app.listen(3000);
```

See [`packages/inertia-express`](packages/inertia-express) for the full API.

## Documentation

Full documentation lives at the [VitePress docs site](docs/) (run `pnpm docs:dev` to browse locally).

Topics:
- [Installation & quick start](docs/guide/installation.md)
- [Props (lazy, optional, deferred, always, merge)](docs/core/props.md)
- [SSR](docs/advanced/ssr.md)
- [View cache](docs/advanced/caching.md)
- [Edge caching](docs/advanced/edge-caching.md)
- [Prerendering](docs/advanced/prerendering.md)
- [API reference](docs/api/)

## Conformance

The adapter is tested against the official `inertiajs/inertia` Playwright suite (~1150 browser tests). See [`conformance/HOW-IT-WORKS.md`](conformance/HOW-IT-WORKS.md) for details on how the conformance run is wired.

```bash
pnpm test:conformance   # vue3 (default), pinned upstream
```

**Last result:** 1126 passed, 1 known flake, 0 adapter conformance failures.

## Development

```bash
pnpm install
pnpm build          # build all packages
pnpm test           # run unit tests in all packages
pnpm typecheck      # TypeScript check across all packages
pnpm lint           # ESLint all source files
pnpm docs:dev       # start VitePress dev server
```

## Requirements

- Node.js >= 24
- Express 4 or 5 (peer dependency)
- ESM-only (`"type": "module"` in your project)

## License

MIT — see [LICENSE](LICENSE).
