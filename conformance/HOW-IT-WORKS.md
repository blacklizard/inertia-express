# How the conformance suite works

A trust-and-transparency walkthrough for anyone evaluating this adapter.

If you only have 30 seconds: this repo runs the **official `inertiajs/inertia`
Playwright test suite** — ~1150 browser tests authored by the Inertia.js
maintainers — against `@blacklizard/inertia-express` in a real Chromium. The
adapter is pinned, the upstream suite is pinned, and the runner is one command:
`pnpm test:conformance`. The last result lives at the bottom of this doc.

Everything below is the long form — what's actually measured, what is **not**,
how the swap-in works, and how to reproduce the run yourself.

---

## Contents

1. [The claim being made](#1-the-claim-being-made)
2. [Why "official conformance" required some engineering](#2-why-official-conformance-required-some-engineering)
3. [The transport port — what changes, what doesn't](#3-the-transport-port--what-changes-what-doesnt)
4. [Honest coverage map — what is and isn't exercised](#4-honest-coverage-map--what-is-and-isnt-exercised)
5. [Reproducibility](#5-reproducibility)
6. [How to verify it yourself](#6-how-to-verify-it-yourself)
7. [What the run found (real bug it caught)](#7-what-the-run-found-real-bug-it-caught)
8. [Known flake](#8-known-flake)
9. [Last result](#9-last-result)

---

## 1. The claim being made

> `@blacklizard/inertia-express` is wire-compatible with the Inertia v3 client
> (`@inertiajs/{vue3,react,svelte}` 3.x) for every protocol behaviour the
> official upstream Playwright suite exercises.

That claim is meaningful only if:

- The suite is the real upstream — not a forked or trimmed copy.
- The adapter is the real published code — not a parallel implementation
  that only "feels like" the adapter.
- The thing in the middle — the small shim that lets the upstream test server
  drive the adapter — is small, readable, and doesn't fake the answer.

The rest of this doc shows each of those.

---

## 2. Why "official conformance" required some engineering

The obvious move — "swap our adapter in, run the upstream tests" — does not
work, and finding out why explains the approach.

### 2.1 There is no standalone `inertiajs/protocol-tests` repo

The `inertiajs` GitHub org has the client core, the framework adapters
(Laravel, Rails, Django, Phoenix), demo apps, and the docs site. There is no
dedicated server-adapter conformance package.

The closest official conformance harness lives **inside `inertiajs/inertia`**:

| Path                      | Size    | Purpose                                                  |
| ------------------------- | ------- | -------------------------------------------------------- |
| `tests/*.spec.ts`         | 53 files, ~1150 tests | Playwright specs driving a real browser     |
| `tests/app/server.js`     | ~105 KB | Express server the specs run against                     |
| `tests/app/helpers.js`    | ~200 LoC| Protocol transport used by `server.js`                   |
| `playwright.config.ts`    |         | Boots the framework test-app + `server.js`, runs specs   |

### 2.2 `server.js` implements the Inertia protocol itself

Looking inside `server.js`: 229 route handlers, each handing `helpers.js` an
already-finished page object. `deferredProps`, `mergeProps`, `deepMergeProps`,
`matchPropsOn`, `alwaysProps` are **pre-computed inline in the routes**.
`helpers.js` is pure transport: it does partial-reload filtering and chooses
JSON vs HTML.

```
Spec → browser → upstream server.js (229 routes, all protocol logic inline)
                       ↓ hands a finished page object
                upstream helpers.js (partial filter + JSON/HTML transport)
                       ↓ HTTP response
                browser ← Inertia client parses, asserts
```

There is no adapter seam. The routes don't call `inertia()`/`res.inertia()`,
they don't use `defer()`/`merge()`/`lazy()`/`always()` — they build the page
object by hand. Plugging an adapter in cleanly would mean rewriting all 229
route call sites, which would be a fork, not a conformance run.

### 2.3 The seam: patch `helpers.js`, leave `server.js` alone

The protocol-engine seam is `helpers.js`. So the approach is a **transport
port** — a unified-diff patch applied to `helpers.js` that keeps page assembly
byte-for-byte identical to upstream's but routes the protocol engine calls
through the adapter's `core` instead of the suite's inline
`processPartialProps`.

The patch ships as [`conformance/helpers.patch`](./helpers.patch). Shipping a
*patch* — rather than a replacement file — is deliberate: the patch is short
(~150 lines of diff), the diff *is* the change, and reviewers can read every
modified line directly without comparing two files side-by-side.

`server.js` is **never touched**. The browser, the client, the spec
assertions, the route handlers — all upstream. Only the ~200-LoC transport
helper is modified, and the modification is visible as a diff.

---

## 3. The transport port — what changes, what doesn't

The patch is [`conformance/helpers.patch`](./helpers.patch) — a unified diff
against upstream's `tests/app/helpers.js` at the pinned commit (~150 lines of
diff including context). Side-by-side:

| Step                         | Upstream `helpers.js`               | Patched `helpers.js`                                                       |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| Build initial page object    | `buildPageData(req, data)`          | **unchanged**                                                              |
| Filter props for partial     | inline `processPartialProps`        | `core.resolveProps()` (the adapter's actual engine)                       |
| Evaluate function-shaped props| `data.props[key](data.props)`      | wrap each as `core.lazy(() => fn(data.props))` so `resolveProps` evaluates|
| Merge `alwaysProps` bag      | `{...props, ...data.alwaysProps}`   | **unchanged, after `resolveProps`**                                       |
| HTML templating              | read framework `index.html`, replace placeholders | **unchanged, every template branch**                       |
| JSON vs HTML decision        | `if (req.get('X-Inertia'))`         | **unchanged**                                                              |
| `location()` / `redirect()`  | 409 + `X-Inertia-Location` / `X-Inertia-Redirect` | **unchanged**                                                |
| Imports                      | CommonJS `require`                  | CJS file using `await import(pathToFileURL(...))` once at module init     |

Because page assembly and HTML templating are unchanged, the bytes on the
wire the Inertia client sees are the same **shape** as upstream's. The
difference is *which code path produces those bytes* — for partial filtering
and prop evaluation, it's the adapter's.

`run.sh` `git checkout`s the upstream `helpers.js` first (reset to the
committed baseline) then `git apply`s the patch, so reruns are idempotent and
a stale working tree can never silently change the result.

The patch is small enough that you can read it end-to-end in five minutes and
confirm there's no fudging.

---

## 4. Honest coverage map — what is and isn't exercised

This is the bit that matters most for trust. The transport port exercises
some adapter code paths and not others. Both lists are non-empty; both are
short enough to keep in your head.

### Exercised against the real Inertia client across ~1150 browser tests

- **Request parsing** — `parseInertiaRequest` (headers, partial component,
  partial-data / partial-except, version, error-bag, reset, method, URL)
- **Partial-reload filtering** — `resolveProps` partial-include / exclude
  logic, including **dotted-path key matching** (`users.data` matches `users`)
- **Prop evaluation** — `lazy`-wrapped evaluation pipeline (the engine that
  also evaluates `optional`/`deferred`/`always` in real adapter usage)
- **Page-object assembly** — `createPage` normalization (history flags, optional
  field omission) is exercised indirectly through the same shape upstream
  produces
- **JSON vs HTML decision** — based on `X-Inertia`
- **Reset semantics** — `X-Inertia-Reset` filtering in the engine
- **Error-bag header parsing**

### Not exercised by this run (covered elsewhere)

- **`defer()`, `merge()`, `deepMerge()`, `optional()`, `always()`** — upstream
  pre-computes `deferredProps`/`mergeProps`/`deepMergeProps`/`matchPropsOn`
  and `alwaysProps` in `server.js` itself, so the conformance suite never
  drives the adapter's *wrapper* API. The wrappers' tagging + detection +
  emission to the page object live in the adapter's own unit + e2e tests:
  - `packages/inertia-express/tests/core/props.test.ts` (20 cases)
  - `packages/inertia-express/tests/express/v3-protocol.e2e.test.ts`
    (the v3 protocol-conformance e2e suite, 24 cases)
- **Express middleware glue** — `res.inertia()` / `res.inertiaLocation()` /
  `res.inertiaErrors()` / the `res.redirect` 303 promotion. Covered by
  `tests/express/middleware.test.ts` (37 cases) + the same e2e suite.
- **SSR view cache, edge cache, SSR worker, Redis cache store, prerender,
  vite-manifest version** — covered by their own unit tests (per-package).
- **Initial-page HTML format (`<script data-page=…>`)** — the conformance
  test-app uses `window.initialPage` (its own convention) and passes `page`
  explicitly to `createInertiaApp`, so the upstream suite does not exercise
  `getInitialPageFromDOM`. Real-browser hydration of the adapter's default
  format is verified against the example apps with a Playwright smoke check.

Nothing in this layout is hidden — the patch is small, `server.js` is
unchanged, and the spec files come from upstream.

---

## 5. Reproducibility

A green run today must be a green run tomorrow on someone else's machine.
Three things are pinned:

1. **The adapter** — every conformance run rebuilds
   `@blacklizard/inertia-express` from the repo's current state before running
   (step 1 of `run.sh`). No risk of testing a stale `dist/`.
2. **The upstream suite** — `conformance/run.sh` pins
   `inertiajs/inertia` to a fixed commit SHA via the `INERTIA_REF` env var
   (defaults to the SHA that produced the published result). Fetched as an
   exact shallow SHA — `git fetch --depth 1 origin <sha>` — so no clone
   walks a moving branch.
3. **Root dependencies** — CI uses `pnpm install --frozen-lockfile`. The
   upstream monorepo install isn't frozen, but it's installed at a pinned
   SHA so its committed `pnpm-lock.yaml` is consistent.

To test against the latest upstream instead of the pin:
`INERTIA_REF=master pnpm test:conformance`.

---

## 6. How to verify it yourself

You don't need to take any of this on trust. Run:

```bash
git clone https://github.com/blacklizard/inertia-express.git
cd inertia-express
pnpm install
pnpm test:conformance                          # vue3 (default), pinned upstream
conformance/run.sh react                       # or react / svelte
INERTIA_REF=master pnpm test:conformance       # test against latest upstream
```

First run takes ~10 minutes (clones upstream, builds the monorepo + the vue3
test-app, downloads a Playwright Chromium binary, runs the specs).
Subsequent runs reuse `conformance/inertia/` and are ~2 minutes. Delete
`conformance/inertia/` to force a fresh fetch.

CI runs the same command on every push to `main` and every pull request via
`.github/workflows/conformance.yml`. Job timeout: 30 minutes.

To inspect what the swap actually does, read
[`conformance/helpers.patch`](./helpers.patch) — the unified diff IS the
change. Or after a run, `cd conformance/inertia && git diff tests/app/helpers.js`
shows the same patch applied to the working tree.

---

## 7. What the run found (real bug it caught)

When the suite was first wired up, **9 specs failed**. Triage (re-running
the same files against the unmodified upstream `helpers.js` as a baseline)
isolated a genuine adapter bug:

`resolveProps` matched partial-reload keys with exact string equality only.
Inertia v3 supports **dotted paths** — `router.reload({ only: ['users.data'] })` —
where the server is meant to keep the whole top-level `users` prop. The
adapter dropped it entirely.

Fixed in `packages/inertia-express/src/core/props.ts` by introducing
`partialKeyMatches`:

```ts
function partialKeyMatches(patterns: string[], key: string): boolean {
  return patterns.some((pattern) => pattern === key || pattern.startsWith(`${key}.`));
}
```

After the fix: 8 of 9 failures resolved. The 9th is a flake (next section).

The bug had also been masked once during triage by a stale `dist/` build —
the conformance server imports the built core, so the adapter is now
rebuilt as the first step of `run.sh`.

---

## 8. Known flake

`tests/links.spec.ts:899` — `scroll › preserves scroll position within a
scroll region while keeping scrolling when navigating` — fails
intermittently under heavy parallel load. It fails **identically** when the
suite is run against upstream's unmodified `helpers.js`, so it is an
environmental issue (scroll-region timing in headless Chromium under
parallel workers), not adapter-related.

Playwright's `--retries=2` (set in `run.sh`) heals it most of the time.
When it doesn't, the rest of the run still reports zero adapter
conformance failures.

---

## 9. Last result

vue3 / chromium, upstream pinned at `3a01522`:

```
1126 passed
   1 failed   (links.spec.ts:899 — known scroll-region flake; fails identically on upstream helpers)
   3 flaky    (passed on retry)
  20 skipped  (suite's own framework-conditional skips)
```

Zero adapter conformance failures. CI runs this on every PR.
