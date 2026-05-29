# Props

Props control what data reaches the client component and when. Beyond plain values, four helpers give fine-grained control over evaluation timing and partial reload behavior.

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

## `lazy(fn)`

Wrap a function to mark it as a lazy prop. Lazy props are evaluated on every visit (full or partial) when included. Unlike `optional`, lazy props **are** included on the initial visit.

```ts
import { lazy } from "@blacklizard/inertia-express";

await res.inertia("Dashboard", {
  recent: lazy(() => userService.recentActivity()),
});
```

The function can be async:

```ts
recent: lazy(async () => await db.activities.findMany({ limit: 10 })),
```

**When to use:** Props that are expensive to compute but should still appear on the first visit.

## `optional(fn)`

Wrap a function to mark it as optional. Optional props are **omitted from the initial response** and only included when explicitly requested via `X-Inertia-Partial-Data` in a partial reload.

```ts
import { optional } from "@blacklizard/inertia-express";

await res.inertia("Users/Show", {
  user: req.user,
  activityLog: optional(() => analytics.getUserActivity(req.user.id)),
});
```

**When to use:** Expensive data that the page doesn't need on first load but may request later.

## `defer(fn, group?)`

Wrap a function to mark it as deferred. Deferred props are **omitted from the initial response**. The client receives the list of deferred prop keys (grouped by `group`) in the page object and automatically triggers a partial reload after mount to fetch them.

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

**When to use:** Data that's expensive enough to block the initial render, where you want the page to load fast then fill in secondary data.

## `always(fn)`

Wrap a function to mark it as an always prop. Always props are included on **every** response — full visits and partial reloads alike — regardless of `X-Inertia-Partial-Data` / `X-Inertia-Partial-Except` filtering.

```ts
import { always } from "@blacklizard/inertia-express";

await res.inertia("Dashboard", {
  auth: always(() => ({ user: req.user ?? null })),
});
```

**When to use:** Data that must reach the client on every visit even when a partial reload narrows the prop set — auth state, CSRF tokens. (Flash data is *not* a prop — use [`flashFromSession`](/core/middleware#flashfromsession), which exposes it as the top-level `flash` page key.)

## `merge(value, matchOn?)`

Mark a value as a merge prop. On partial reloads, the Inertia client appends the new value to the existing prop rather than replacing it. Useful for paginated arrays and infinite scroll feeds.

```ts
import { merge } from "@blacklizard/inertia-express";

app.get("/feed", async (req, res) => {
  const page = Number(req.query.page ?? 1);
  await res.inertia("Feed", {
    posts: merge(await db.posts.findMany({ page })),
  });
});
```

On the client, subsequent partial reloads for `posts` will append rather than replace.

Pass `matchOn` (a field name or list of field names) to have the client dedupe array items on that field instead of blindly appending:

```ts
posts: merge(await db.posts.findMany({ page }), "id"),
```

This emits `matchPropsOn: ["posts.id"]` in the page object.

## `deepMerge(value, matchOn?)`

Like `merge`, but the client recursively *deep*-merges the value into the existing prop rather than shallow-appending. Use it when the prop is a nested object whose sub-trees should be combined.

```ts
import { deepMerge } from "@blacklizard/inertia-express";

await res.inertia("Dashboard", {
  filters: deepMerge({ sort: { field: "name" } }),
  rows: deepMerge(await db.rows.page(page), ["id"]),
});
```

Deep-merge keys are emitted in the page object as `deepMergeProps`.

## Resetting merge props

When the client wants a merge / deep-merge prop *replaced* rather than appended, it sends the prop key in the `X-Inertia-Reset` header. The server drops that key from `mergeProps` / `deepMergeProps` / `matchPropsOn` — the fresh value is still sent, but the client replaces instead of merging.

## Combining helpers

```ts
await res.inertia("Dashboard", {
  // Plain — always present, always current
  user: req.user,

  // Lazy — evaluated every visit, but as a function so work is deferred until needed
  recentActivity: lazy(() => db.activity.findMany({ userId: req.user.id })),

  // Optional — skipped on full visit; available for partial reload on demand
  adminPanel: optional(() => admin.getStats()),

  // Deferred — loaded automatically after mount via partial reload
  charts: defer(() => analytics.getChartData(), "charts"),

  // Always — included on every response, ignores partial filters
  auth: always(() => ({ user: req.user ?? null })),

  // Merge — appended on partial reload for pagination
  notifications: merge(await db.notifications.page(req.query.page), "id"),
});
```

## Summary

| Helper | Initial visit | Partial reload (not requested) | Partial reload (requested) |
|--------|:---:|:---:|:---:|
| Plain value | ✅ | Depends on filter | ✅ |
| `lazy(fn)` | ✅ evaluated | Depends on filter | ✅ evaluated |
| `optional(fn)` | ❌ skipped | ❌ skipped | ✅ evaluated |
| `defer(fn)` | ❌ skipped (key sent in `deferredProps`) | ❌ skipped | ✅ evaluated |
| `always(fn)` | ✅ evaluated | ✅ evaluated (bypasses filter) | ✅ evaluated |
| `merge(value)` | ✅ included, full replace | Depends on filter | ✅ appended |
| `deepMerge(value)` | ✅ included, full replace | Depends on filter | ✅ deep-merged |
