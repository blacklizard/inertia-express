# Introduction

`@blacklizard/inertia-express` is a production-ready, TypeScript-first implementation of the [Inertia.js v3](https://inertiajs.com) server protocol for Node.js + Express.

## What is Inertia.js?

Inertia is a glue layer that lets you build modern SPA-style frontends (Vue, React, Svelte) on top of classic server-side routing and controllers — without building a separate API.

The server renders page components directly (no REST API), the client navigates without full reloads, and both sides share one language for routing logic.

## What this package does

This package is the **server half** of that equation for Express. It:

1. Parses incoming Inertia XHR headers into `req.inertia`
2. Attaches `res.inertia(component, props)` to every response
3. Returns the page object as JSON for Inertia (XHR) requests
4. Returns a complete HTML document for first-page loads (optionally with SSR)
5. Handles all v3 protocol details: versioning, partial reloads, deferred props, redirects, history management

## Monorepo packages

| Package | Description |
|---------|-------------|
| [`@blacklizard/inertia-express`](/packages/inertia-express) | Core adapter — install this in every project |
| [`@blacklizard/inertia-cache-redis`](/packages/inertia-cache-redis) | Redis-backed SSR view cache (optional) |
| [`@blacklizard/inertia-ssr-worker`](/packages/inertia-ssr-worker) | Out-of-process SSR HTTP worker (optional) |

## Framework support

The internal `core` is framework-agnostic. The Express adapter (`packages/inertia-express`) wraps it with Express-specific middleware, type augmentation, and helpers. The core is exposed as a separate subpath export for building adapters for other frameworks:

```ts
import { buildPage, parseInertiaRequest, resolveProps } from "@blacklizard/inertia-express/core";
```

## Compatibility

- **Inertia.js** v3 protocol
- **Node.js** >= 24
- **Express** 4 or 5 (peer dep; tested against Express 5)
- **ESM-only** (no CommonJS)
- **TypeScript** 5.6+

## Frontend compatibility

Works with any Inertia client adapter:

- [`@inertiajs/vue3`](https://inertiajs.com/client-side-setup)
- [`@inertiajs/react`](https://inertiajs.com/client-side-setup)
- [`@inertiajs/svelte`](https://inertiajs.com/client-side-setup)
