# API: Props Helpers

## `lazy(fn)`

Marks a function as a lazy prop. Evaluated on every visit (full and partial) when the key is included.

```ts
import { lazy } from "@blacklizard/inertia-express";

lazy<T>(fn: () => T | Promise<T>): LazyProp<T>
```

**Returns:** `LazyProp<T>` — a tagged function

```ts
await res.inertia("Dashboard", {
  activity: lazy(() => db.activity.findMany()),
});
```

---

## `optional(fn)`

Marks a function as optional. Omitted from the initial response; only included when explicitly requested via `X-Inertia-Partial-Data`.

```ts
optional<T>(fn: () => T | Promise<T>): OptionalProp<T>
```

```ts
await res.inertia("Dashboard", {
  heavyData: optional(() => analytics.getExpensiveReport()),
});
```

---

## `defer(fn, group?)`

Marks a function as deferred. Omitted from the initial response. The client receives the key in `deferredProps` and automatically issues a partial reload after mount.

```ts
defer<T>(fn: () => T | Promise<T>, group?: string): DeferredProp<T>
```

| Argument | Default | Description |
|----------|---------|-------------|
| `fn` | — | Value-producing function |
| `group` | `"default"` | Group name. Props in the same group are fetched together. |

```ts
await res.inertia("Dashboard", {
  charts: defer(() => analytics.getCharts(), "charts"),
  widgets: defer(() => widgets.getAll(), "charts"), // same group — one request
  feed: defer(() => db.feed.findMany(), "feed"),    // different group
});
```

---

## `always(fn)`

Marks a function as an always prop. Included on every response — full visits **and** partial reloads — regardless of `X-Inertia-Partial-Data` / `X-Inertia-Partial-Except` filtering.

```ts
always<T>(fn: () => T | Promise<T>): AlwaysProp<T>
```

```ts
await res.inertia("Dashboard", {
  flash: always(() => req.session.flash),
});
```

---

## `merge(value, matchOn?)`

Marks a value as a merge prop. On partial reloads, the Inertia client appends the new value to the existing prop instead of replacing it.

```ts
merge<T extends object>(value: T, matchOn?: string | string[]): MergeProp<T>
```

| Argument | Default | Description |
|----------|---------|-------------|
| `value` | — | The prop value (typically an array) |
| `matchOn` | — | Field name(s) the client dedupes array items on instead of blindly appending. Emitted as `matchPropsOn` dotted paths. |

```ts
await res.inertia("Feed", {
  posts: merge(await db.posts.findMany({ page }), "id"),
});
```

---

## `deepMerge(value, matchOn?)`

Like `merge`, but the client recursively *deep*-merges the value into the existing prop rather than shallow-appending. Emitted in the page object as `deepMergeProps`.

```ts
deepMerge<T extends object>(value: T, matchOn?: string | string[]): DeepMergeProp<T>
```

```ts
await res.inertia("Dashboard", {
  filters: deepMerge({ sort: { field: "name" } }),
  rows: deepMerge(await db.rows.page(page), ["id"]),
});
```

> **Reset:** when the client sends `X-Inertia-Reset: <key>`, that key is dropped
> from `mergeProps` / `deepMergeProps` / `matchPropsOn` so the prop is replaced
> instead of merged. The fresh value is still sent.

---

## Type definitions

```ts
// Tagged function types (internal tags are non-enumerable — transparent at runtime)
type LazyProp<T = unknown> = (() => T | Promise<T>) & { readonly __inertia_lazy: true };
type OptionalProp<T = unknown> = (() => T | Promise<T>) & { readonly __inertia_optional: true };
type AlwaysProp<T = unknown> = (() => T | Promise<T>) & { readonly __inertia_always: true };
type DeferredProp<T = unknown> = (() => T | Promise<T>) & {
  readonly __inertia_deferred: true;
  readonly group: string;
};
type MergeProp<T extends object = object> = T & {
  readonly __inertia_merge: true;
  readonly __inertia_match_on?: string[];
};
type DeepMergeProp<T extends object = object> = T & {
  readonly __inertia_deep_merge: true;
  readonly __inertia_match_on?: string[];
};
```

---

## `resolveProps(input)` (core)

Low-level function used internally to combine and evaluate props per request. Exported from the core subpath for adapter authors.

```ts
import { resolveProps } from "@blacklizard/inertia-express/core";

const result = await resolveProps({
  props: pageProps,
  shared: sharedProps,
  component: "Dashboard",
  request: req.inertia,
});

// result.props     — evaluated props to send
// result.deferred  — { groupName: ["key1", "key2"] }
// result.merge     — ["key1"] — keys using shallow merge behaviour
// result.deepMerge — ["key2"] — keys using deep merge behaviour
// result.matchOn   — ["key1.id"] — dotted prop.field match-on paths
```
