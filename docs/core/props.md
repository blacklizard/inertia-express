# Props

Props control what data reaches the client component and when. Every prop value is either a plain value, a bare closure, or a **descriptor** built by one of the helper constructors below. Descriptors are chainable and mirror inertia-laravel's prop classes; the resolver is a port of its `PropsResolver`.

```ts
import { always, deepMerge, defer, merge, once, optional, scroll } from "@blacklizard/inertia-express";
```

## Plain props

Evaluated synchronously at render time. Always included in the response.

```ts
await res.inertia("Dashboard", {
  user: req.user,
  settings: appSettings,
});
```

Async values are also fine — `await` them before passing:

```ts
await res.inertia("Users/Index", {
  users: await db.users.findMany(),
});
```

## Bare closures

Pass a function instead of a value to defer the work until the prop is actually sent. A bare closure is evaluated (and awaited if it returns a promise) on each response that includes it, including the initial visit. A partial reload that does not request the key skips the call entirely.

```ts
app.get("/dashboard", async (req, res) => {
  await res.inertia("Dashboard", {
    user: req.user,
    recent: () => userService.recent(),
  });
});
```

**When to use:** Props that should appear on the first visit but are worth skipping when a partial reload narrows the prop set. A bare closure replaces the 2.x `lazy()` helper, which is removed.

## `optional(fn)`

Optional props are **omitted from the initial response** and only included when explicitly requested via `X-Inertia-Partial-Data` in a partial reload. `fn` must be a function (anything else throws a `TypeError`).

```ts
import { optional } from "@blacklizard/inertia-express";

await res.inertia("Users/Show", {
  user: req.user,
  activityLog: optional(() => analytics.getUserActivity(req.user.id)),
});
```

**Chains:** `.once()`, `.as()`, `.until()`, `.fresh()` — see [`once`](#once-fn).

**When to use:** Expensive data that the page doesn't need on first load but may request later.

## `defer(fn, group?)`

Deferred props are **omitted from the initial response**. The client receives the deferred prop keys (grouped by `group`, default `"default"`) in the page object's `deferredProps` and automatically triggers a partial reload after mount to fetch them. `fn` must be a function.

```ts
import { defer } from "@blacklizard/inertia-express";

await res.inertia("Dashboard", {
  // Fast data — included on initial visit
  summary: await dashboard.getSummary(),

  // Slow data — deferred, loaded after mount
  reports: defer(() => analytics.getReports(), "dashboard"),
  notifications: defer(() => db.notifications.findMany(), "dashboard"),

  // Different group — separate partial reload request
  recommendations: defer(() => ml.getRecommendations(req.user), "ml"),
});
```

Props in the same group are fetched in one batch request.

**Chains:** `.merge()`, `.deepMerge()`, `.append()`, `.prepend()`, `.matchOn()` (see [Merge props](#merge-props)), `.once()`, `.as()`, `.until()`, `.fresh()` (see [`once`](#once-fn)), and `.rescue()`.

```ts
await res.inertia("Feed", {
  // Deferred and merged into the client's existing value when it arrives
  posts: defer(() => db.posts.page(page)).merge().matchOn("id"),
});
```

**When to use:** Data that's expensive enough to block the initial render, where you want the page to load fast then fill in secondary data.

### Rescuing failures

`.rescue()` opts a deferred prop into error rescue. If its producer throws, the prop is dropped from the response instead of failing the whole request, its path is listed in the page object's `rescuedProps`, and the middleware's [`onRescue`](/core/middleware#onrescue) hook is called with `(error, path, req)`. Without a hook the error is logged with `console.error`.

```ts
await res.inertia("Dashboard", {
  feed: defer(() => feedService.load()).rescue(),
});
```

Errors thrown by the `onRescue` hook itself (or a rejected promise it returns) are logged with `console.error` and never propagated.

## `always(value)`

Always props are included on **every** response — full visits and partial reloads alike — regardless of `X-Inertia-Partial-Data` / `X-Inertia-Partial-Except` filtering. Takes a plain value or a function. It has no chain methods.

```ts
import { always } from "@blacklizard/inertia-express";

await res.inertia("Dashboard", {
  auth: always(() => ({ user: req.user ?? null })),
});
```

**When to use:** Data that must reach the client on every visit even when a partial reload narrows the prop set — auth state, CSRF tokens. (Flash data is *not* a prop — use [`flashFromSession`](/core/middleware#flashfromsession), which exposes it as the top-level `flash` page key.)

## Merge props

### `merge(value)`

Mark a prop as a merge prop. The Inertia client appends the new value to its existing value at the root rather than replacing it. Useful for paginated arrays. Takes a plain value or a function — and exactly **one** argument: a second argument (the 2.x `matchOn` form) throws a `TypeError`.

```ts
import { merge } from "@blacklizard/inertia-express";

app.get("/feed", async (req, res) => {
  const page = Number(req.query.page ?? 1);
  await res.inertia("Feed", {
    posts: merge(() => db.posts.findMany({ page })),
  });
});
```

This emits `mergeProps: ["posts"]` in the page object.

### `deepMerge(value)`

Like `merge`, but the client recursively *deep*-merges the value into the existing prop rather than appending. Use it when the prop is a nested object whose sub-trees should be combined. Also takes exactly one argument.

```ts
import { deepMerge } from "@blacklizard/inertia-express";

await res.inertia("Dashboard", {
  filters: deepMerge({ sort: { field: "name" } }),
});
```

Deep-merge keys are emitted in the page object as `deepMergeProps`.

### Deduping with `.matchOn(path)`

Chain `.matchOn()` (a field path or a list of them) to have the client dedupe array items on that field instead of blindly appending:

```ts
posts: merge(() => db.posts.findMany({ page })).matchOn("id"),
rows: deepMerge(() => db.rows.page(page)).matchOn(["id"]),
```

This emits `matchPropsOn: ["posts.id"]` (and `"rows.id"`). Each call to `.matchOn()` replaces the previous list.

### Nested paths with `.append()` / `.prepend()`

By default a merge prop appends at its root. Chain `.append(path, matchOn)` or `.prepend(path, matchOn)` (both arguments optional) to merge a nested path instead; a string `path` with a `matchOn` field also dedupes on `path.matchOn`. The `path` argument may be:

| Argument | Effect |
|----------|--------|
| `true` (default) / `false` | Sets the root direction: `.prepend(true)` prepends at the root, `.append(false)` does the same |
| `"data"` | Merges at the dotted path `data` |
| `["data", "meta.items"]` | Merges at each path |
| `{ data: "id" }` | Merges at `data`, deduping on `id` (same as `.append("data", "id")`) |

```ts
app.get("/notifications", async (req, res) => {
  await res.inertia("Notifications", {
    // { data: [...], pinned: [...] } — append to data (dedupe on id), prepend to pinned
    feed: merge(() => feedService.page(req.query.page)).append("data", "id").prepend("pinned"),

    // Newest-first list: prepend at the root
    messages: merge(() => inbox.latest()).prepend(true),
  });
});
```

Root appends are emitted under `mergeProps`, root prepends under `prependProps`. Nested paths are emitted with the prop key prefixed — the `feed` prop above emits `mergeProps: ["feed.data"]`, `prependProps: ["feed.pinned"]` and `matchPropsOn: ["feed.data.id"]`. A `deepMerge` prop is always emitted under `deepMergeProps`, whatever its append/prepend paths.

### Resetting merge props

When the client wants a merge / deep-merge prop *replaced* rather than merged, it sends the prop key in the `X-Inertia-Reset` header. The server drops that key from `mergeProps` / `prependProps` / `deepMergeProps` / `matchPropsOn` — the fresh value is still sent, but the client replaces instead of merging.

## `once(fn)`

A once prop is resolved once and cached by the client across visits. On later visits the client lists the keys it already holds in the `X-Inertia-Except-Once-Props` header, and the server skips those producers. That header is ignored on non-Inertia (first-load) requests and on partial reloads. `fn` must be a function.

```ts
import { once } from "@blacklizard/inertia-express";

app.get("/settings", async (req, res) => {
  await res.inertia("Settings", {
    countries: once(() => geo.countries()).as("countries").until(3600),
    plans: once(() => billing.plans()).until(new Date("2027-01-01")),
    banner: once(() => cms.banner()).fresh(req.query.refresh === "1"),
  });
});
```

| Chain | Effect |
|-------|--------|
| `.as(key)` | Cache key the client stores the value under (default: the prop path). Shareable across pages. |
| `.until(delay)` | Expiry: a number of **seconds** from now, or an absolute `Date`. The last `.until()` call wins. |
| `.fresh(value = true)` | Force re-resolution on this response even if the client holds the value. |

Every once prop is listed in the page object's `onceProps`, keyed by its once key: `{ [key]: { prop, expiresAt } }`, where `prop` is the prop path and `expiresAt` is a millisecond epoch timestamp or `null` when it never expires.

`optional`, `defer` and `merge` descriptors also accept `.once()` (plus `.as()`, `.until()` and `.fresh()`); `.once(value?, as?, until?)` takes the key and expiry inline:

```ts
plans: defer(() => billing.plans()).once(true, "plans", 3600),
```

## `scroll(fn, options)`

An infinite-scroll prop: merged at its `wrapper` key (default `"data"`) and emitted with pagination metadata. `fn` must be a function, and `options.metadata` is required (a `TypeError` is thrown otherwise) — either a `ScrollMetadata` object or a function deriving it from the resolved value. The resolved value must contain the wrapper key.

```ts
import { scroll } from "@blacklizard/inertia-express";

app.get("/posts", async (req, res) => {
  await res.inertia("Posts", {
    posts: scroll(() => postService.paginate(req.query.page), {
      metadata: (page) => ({
        pageName: "page",
        previousPage: page.prev,
        nextPage: page.next,
        currentPage: page.current,
      }),
    }).matchOn("id"),

    comments: scroll(() => commentService.page(1), {
      wrapper: "items",
      metadata: { pageName: "page", previousPage: null, nextPage: 2, currentPage: 1 },
    }).defer(),
  });
});
```

The page object gets `scrollProps: { [path]: { pageName, previousPage, nextPage, currentPage, reset } }`; `reset` is `true` when the client listed the prop in `X-Inertia-Reset`. The merge direction follows the client's `X-Inertia-Infinite-Scroll-Merge-Intent` header: `prepend` emits the wrapper path under `prependProps`, anything else (or no header) appends under `mergeProps`.

**Chains:** `.defer(group?)` loads the first page in a follow-up request; `.matchOn(path)` dedupes items.

## Descriptors are per-request values

Descriptors are builders: every chain method mutates and returns the same object. Create them inside the handler for each request rather than hoisting one to module level and chaining on it per request — the chained configuration would accumulate across requests. The resolver itself only reads descriptors, so a hoisted descriptor that is never changed after creation is safe to reuse. See [Caveats](/guide/caveats#descriptors-are-mutable).

```ts
// ✅ built per request
app.get("/feed", async (req, res) => {
  await res.inertia("Feed", { posts: merge(() => db.posts.page(req.query.page)).matchOn("id") });
});
```

## Nested props and partial reloads

Descriptors and closures may appear anywhere in the props tree, not only at the top level; metadata paths are dotted (`"users.data"`). Partial reloads follow dotted paths too:

- `only: ["users.data"]` on a plain-object `users` returns just `{ users: { data } }`. Children of a closure or descriptor bypass filtering and come back whole.
- `except: ["users.data"]` drops the **whole** top-level `users`. This matches 2.x and the upstream reference server; inertia-laravel keeps `users` and drops only the child, and the adapter deliberately differs from it here.

More partial-reload edge cases are listed under [Caveats](/guide/caveats#nested-except-drops-the-parent).

## Combining helpers

```ts
await res.inertia("Dashboard", {
  // Plain — always present, always current
  user: req.user,

  // Bare closure — evaluated only on responses that include it
  recentActivity: () => db.activity.findMany({ userId: req.user.id }),

  // Optional — skipped on full visit; available for partial reload on demand
  adminPanel: optional(() => admin.getStats()),

  // Deferred — loaded automatically after mount via partial reload; failures rescued
  charts: defer(() => analytics.getChartData(), "charts").rescue(),

  // Always — included on every response, ignores partial filters
  auth: always(() => ({ user: req.user ?? null })),

  // Merge — appended on partial reload for pagination, deduped on id
  notifications: merge(() => db.notifications.page(req.query.page)).matchOn("id"),

  // Once — cached by the client for an hour
  plans: once(() => billing.plans()).until(3600),
});
```

## Summary

| Helper | Initial visit | Partial reload (not requested) | Partial reload (requested) |
|--------|:---:|:---:|:---:|
| Plain value | ✅ | Depends on filter | ✅ |
| Bare closure | ✅ evaluated | Depends on filter | ✅ evaluated |
| `optional(fn)` | ❌ skipped | ❌ skipped | ✅ evaluated |
| `defer(fn)` | ❌ skipped (key sent in `deferredProps`) | ❌ skipped | ✅ evaluated |
| `always(value)` | ✅ evaluated | ✅ evaluated (bypasses filter) | ✅ evaluated |
| `merge(value)` | ✅ included, full replace | Depends on filter | ✅ appended / prepended |
| `deepMerge(value)` | ✅ included, full replace | Depends on filter | ✅ deep-merged |
| `once(fn)` | ✅ evaluated, unless the client already holds it | Depends on filter | ✅ evaluated |
| `scroll(fn, options)` | ✅ evaluated (❌ with `.defer()`) | Depends on filter | ✅ merged at the wrapper key |

## Migrating from 2.x

| 2.x | 3.0 |
|---|---|
| `lazy(fn)` (removed) | `fn` (a bare closure) |
| `merge(value, matchOn)` | `merge(value).matchOn(matchOn)` |
| `deepMerge(value, matchOn)` | `deepMerge(value).matchOn(matchOn)` |
| `defer(fn, group)` | unchanged |
| `optional(fn)`, `always(fn)` | unchanged |
| `resolveProps()` → `{ props, deferred, merge, deepMerge, matchOn }` | `{ props, metadata }` |
| Types `MergeProp<T> = T & {...}` | descriptor types; the page `props` type is unchanged |

Other changes to check when upgrading:

- `merge(value, "id")` and `deepMerge(value, "id")` now throw a `TypeError` instead of silently ignoring the second argument. Use `.matchOn("id")`.
- Partial reloads follow dotted paths — see [Nested props and partial reloads](#nested-props-and-partial-reloads).
- Types: `DeferredProp` is renamed to `DeferProp`. `LazyProp`, `DeepMergeProp` and `PropValue` are removed. `MergeProp<T>` is now the descriptor interface returned by `merge()` / `deepMerge()`, not `T & {...}`.
- Core-entry adapter authors who build these objects by hand: `InertiaPage.preserveFragment` is now required, and `InertiaRequestInfo` gains the required fields `exceptOnceProps` and `mergeIntent`.
- `sharedProps` (the list of shared top-level keys) is now emitted on every page that has shared props. `errors` is shared on every page, so it is always listed there.
- Sibling props still resolve concurrently, as in 2.x, and the output key order and metadata order are deterministic (insertion order).
