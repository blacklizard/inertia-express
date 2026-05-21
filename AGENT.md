# AGENT.md

Guide for AI agents working in this repo.

## What this is

`inertia-express` — Inertia.js **v3** server adapter for Node.js, first-class Express support. pnpm monorepo.

## Layout

```
packages/
  inertia-express/      Core adapter. Framework-agnostic `core/` + `express/` wrapper.
  inertia-cache-redis/  Redis-backed SSR view cache store.
  inertia-ssr-worker/   Production SSR worker (health/readiness, recycling, drain).
examples/               express-react, express-vue, express-vue-prod, express-vue-showcase
docs/                   VitePress docs site.
conformance/            Official inertiajs/inertia Playwright suite runner. See conformance/HOW-IT-WORKS.md.
```

`conformance/inertia/` is a regenerable upstream checkout — not committed; delete to force a fresh clone.

`packages/inertia-express/src` splits in two:
- `core/` — protocol primitives, no Express dependency. Build adapters for any HTTP framework here.
- `express/` — middleware, `res.inertia()` helper, SSR/cache wiring. Wraps `core/`.

Exports: `.` → `express/index.js`, `./core` → `core/index.js`.

## Commands

Run from repo root:

| Command | Action |
|---|---|
| `pnpm build` | Build all packages (tsup) |
| `pnpm test` | Run all package tests (vitest) |
| `pnpm typecheck` | `tsc --noEmit` across packages |
| `pnpm lint` | ESLint over `packages/*/src` |
| `pnpm clean` | Remove `dist/` |
| `pnpm test:conformance` | Run the official Inertia v3 Playwright suite against the adapter (vue3) |
| `pnpm docs:dev` | VitePress docs dev server |

Per-package: `cd packages/<name> && pnpm test` (or `test:watch`, `build`, `dev`, `typecheck`).

## Stack

- Node >= 24, ESM only (`"type": "module"` — use `.js` extensions in relative imports).
- TypeScript 5.6, build via `tsup`.
- Test: `vitest` + `supertest` for Express e2e.
- Lint: ESLint flat config via `@blacklizard/eslint-blacklizard` (airbnb-extended, single quotes, 120 line width). `pnpm lint` scopes to `packages/*/src`. `eslint.config.mjs` extends the shared config and relaxes `max-depth` to 4.
- Express peer dep: `^4.18.0 || ^5.0.0`.

## Conventions

- Comment only the non-obvious WHY. No what-comments, no narration, no AI attribution.
- No over-engineering — no speculative abstractions or backwards-compat shims.
- Protocol changes: cross-check `tests/express/v3-protocol.e2e.test.ts` — the v3 conformance suite. Add a case there for any protocol-facing change.
- Verify before reporting done: `pnpm lint && pnpm typecheck && pnpm test` green.
- For protocol-engine changes (partial reloads, prop resolution, page object), also run `pnpm test:conformance` — the official upstream browser suite.

## Inertia v3 protocol reference

https://inertiajs.com/the-protocol — page object shape, partial reloads, deferred/merge props, asset versioning, `X-Inertia-Location` redirects.
