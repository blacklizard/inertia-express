# How the conformance suite works

A trust-and-transparency walkthrough for anyone evaluating this adapter.

If you only have 30 seconds: this repo runs the **official `inertiajs/inertia`
Playwright test suite** — ~1350 browser tests authored by the Inertia.js
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
  drive the adapter — is small, readable, doesn't fake the answer, and does
  not modify the upstream checkout.

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
| `tests/*.spec.ts`         | 64 files, ~1350 tests | Playwright specs driving a real browser     |
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
they don't use `defer()`/`merge()`/`optional()`/`always()` — they build the page
object by hand. Plugging an adapter in cleanly would mean rewriting all 229
route call sites, which would be a fork, not a conformance run.

### 2.3 The seam: swap `helpers.js` at require time, touch nothing

The protocol-engine seam is `helpers.js`. So the approach is a **transport
port** — a replacement module, [`conformance/helpers.cjs`](./helpers.cjs),
that keeps page assembly byte-for-byte identical to upstream's but routes the
protocol engine calls through the adapter's `core` instead of the suite's
inline `processPartialProps`.

The swap happens at module-resolution time, not on disk.
[`conformance/preload.cjs`](./preload.cjs) is a ~25-line Node preload
(`NODE_OPTIONS=--require`) that hooks `Module._resolveFilename`: when
`server.js` asks for `./helpers` and Node resolves that to the upstream
`tests/app/helpers.js`, the hook returns `conformance/helpers.cjs` instead.
Every other `require` resolves normally.

Consequence: the `inertiajs/inertia` checkout is **never modified** — no
patch, no `git apply`, no reset step. `run.sh` enforces this: it refuses to
run if `git diff` in the checkout is non-empty. `server.js`, the browser, the
client, the spec assertions, the route handlers, the framework test-app — all
upstream, all pristine. The only non-upstream code in the process is the
~200-LoC transport module, and the suite output carries proof it was loaded
(see §3).

---

## 3. The transport port — what changes, what doesn't

[`conformance/helpers.cjs`](./helpers.cjs) is upstream's `tests/app/helpers.js`
at the pinned commit with one function swapped. `diff` it against the upstream
file to see exactly what changed. Side-by-side:

| Step                         | Upstream `helpers.js`               | `conformance/helpers.cjs`                                                  |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| Build initial page object    | `buildPageData(req, data)`          | **unchanged**                                                              |
| Filter props for partial     | inline `processPartialProps`        | `core.resolveProps()` (the adapter's actual engine)                       |
| Evaluate function-shaped props| `data.props[key](data.props)`      | passed to `resolveProps` as **bare closures** `() => fn(data.props)` — the engine must recognise and evaluate them itself, exactly as it does for a real route's props |
| Merge `alwaysProps` bag      | `{...props, ...data.alwaysProps}`   | **unchanged, after `resolveProps`**                                       |
| HTML templating              | read framework `index.html`, replace placeholders | **unchanged, every template branch** (paths re-rooted to the checkout) |
| JSON vs HTML decision        | `if (req.get('X-Inertia'))`         | **unchanged**                                                              |
| `location()` / `redirect()`  | 409 + `X-Inertia-Location` / `X-Inertia-Redirect` | **unchanged**                                                |
| Imports                      | CommonJS `require`                  | CJS file using `await import(pathToFileURL(...))` once at module init     |
| Module load                  | —                                   | writes `[conformance] helpers swapped → …` to stderr                      |

The arity shim (`() => fn(data.props)`) is the one concession: upstream routes
author function props as `(props) => …`, a convention of the reference server,
not of the protocol. Nothing is pre-wrapped — an earlier version of this port
wrapped every closure in the 2.x `core.lazy()` helper (removed in 3.0), which
masked a real adapter bug
(bare closures were silently dropped) for the suite's whole life. The port
now hands the engine exactly what a route handler would.

Because page assembly and HTML templating are unchanged, the bytes on the
wire the Inertia client sees are the same **shape** as upstream's. The
difference is *which code path produces those bytes* — for partial filtering
and prop evaluation, it's the adapter's.

**Proof the swap happened.** Upstream's own `helpers.js` also passes this
suite, so a green run alone does not show the adapter was in the loop. The
replacement module therefore writes one line to stderr when it loads, and
Playwright pipes its web server's stderr into the run output:

```
[WebServer] [conformance] helpers swapped → …/conformance/helpers.cjs (core: …/packages/inertia-express/dist/core/index.js)
```

If that line is missing from a run, the run proves nothing.

---

## 4. Honest coverage map — what is and isn't exercised

This is the bit that matters most for trust. The transport port exercises
some adapter code paths and not others. Both lists are non-empty; both are
short enough to keep in your head.

### Exercised against the real Inertia client across ~1350 browser tests

- **Request parsing** — `parseInertiaRequest` (headers, partial component,
  partial-data / partial-except, version, error-bag, reset, method, URL)
- **Partial-reload filtering** — `resolveProps` partial-include / exclude
  logic, including **dotted-path key matching** (`users.data` matches `users`)
- **Prop evaluation** — bare-closure detection and evaluation (the same
  resolver pipeline that evaluates `optional`/`defer`/`always`/`merge`/`once`/
  `scroll` descriptors in real adapter usage)
- **Page-object assembly** — `createPage` normalization (history flags, optional
  field omission) is exercised indirectly through the same shape upstream
  produces
- **JSON vs HTML decision** — based on `X-Inertia`
- **Reset semantics** — `X-Inertia-Reset` filtering in the engine
- **Error-bag header parsing**

### Not exercised by this run (covered elsewhere)

- **`defer()`, `merge()`, `deepMerge()`, `optional()`, `always()`, `once()`,
  `scroll()`** — upstream
  pre-computes `deferredProps`/`mergeProps`/`deepMergeProps`/`matchPropsOn`
  and `alwaysProps` in `server.js` itself, so the conformance suite never
  drives the adapter's descriptor API. Descriptor resolution + emission of
  page metadata live in the adapter's own unit + e2e tests:
  - `packages/inertia-express/tests/core/props.test.ts` and
    `tests/core/props-resolver.test.ts` (ported from inertia-laravel)
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

Nothing in this layout is hidden — the replacement module is small, the
preload is tiny, the checkout is byte-for-byte upstream, and the run refuses
to start otherwise.

---

## 5. Reproducibility

A green run today must be a green run tomorrow on someone else's machine.
Three things are pinned:

1. **The adapter** — every conformance run rebuilds
   `@blacklizard/inertia-express` from the repo's current state before running
   (step 1 of `run.sh`). No risk of testing a stale `dist/`.
2. **The upstream suite** — `conformance/run.sh` pins
   `inertiajs/inertia` to a **release tag** (`INERTIA_TAG`, the version of
   `@inertiajs/*` users actually install) *and* records that tag's commit
   (`INERTIA_TAG_SHA`). Tags can be moved; commits cannot. After the shallow
   fetch the script asserts `HEAD` equals the recorded commit and refuses to
   run otherwise. Bumping the pin means changing both lines together.
3. **Root dependencies** — CI uses `pnpm install --frozen-lockfile`. The
   upstream monorepo install isn't frozen, but it's installed at a pinned
   SHA so its committed `pnpm-lock.yaml` is consistent.

To test against something other than the pin:
`INERTIA_REF=master pnpm test:conformance` (any tag, branch or commit works;
the commit assert is skipped for overrides, and a non-pinned ref is always
re-fetched because branches move).

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
[`conformance/preload.cjs`](./preload.cjs) (how) and diff
[`conformance/helpers.cjs`](./helpers.cjs) against
`conformance/inertia/tests/app/helpers.js` (what). After a run,
`git -C conformance/inertia status` is empty — that is the point.

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

A second bug surfaced later, when the port stopped pre-wrapping function
props in the 2.x `core.lazy()` and handed the engine bare closures instead: the
engine dropped them. 17 partial-reload specs and 1 precognition spec went red
at once, all healed by teaching `resolveProps` to treat a bare function
exactly like the reference server does. Lesson encoded in §3: the port must
never rewrite its inputs, or the suite tests the port, not the adapter.

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

vue3 / chromium, upstream pinned at release `v3.11.0` (commit `f312557`),
2026-11-07, checkout pristine, swap marker present in output:

```
1347 passed
   0 failed
   3 flaky    (passed on retry; see §8)
  19 skipped  (suite's own framework-conditional skips)
```

The flaky cases were `tests/head.spec.ts:72` and `:113` and
`tests/optimistic.spec.ts:165`. The optimistic one fails the same way when the
file is run alone against upstream's unmodified `helpers.js`, so it is timing in
the suite, not the adapter.

**Nested `except`.** The reference Node server (`tests/app/helpers.js`,
`processPartialProps`) filters top-level keys only and drops a key whenever
any `X-Inertia-Partial-Except` entry equals it or lives under it:
`except: ['auth.notifications']` drops the whole `auth` prop.
inertia-laravel's `PropsResolver` keeps `auth` and drops only the child. The
adapter follows the reference server (user ruling 2026-11-07), so
`tests/nested-props.spec.ts` › "it preserves rescued child props when that
child path is excluded from reload" runs unmodified; the Laravel-only
behaviour is pinned nowhere.

Read §4 before reading anything into "0 failed": the routes pre-compute every
v3 page key, so this number says the adapter's request parsing, partial
filtering and prop evaluation are wire-correct against client 3.11.0 — not
that the adapter implements every 3.11.0 feature.

Zero adapter conformance failures. CI runs this on every PR.
