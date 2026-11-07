# API: Props Helpers

All constructors are exported from both `@blacklizard/inertia-express` and `@blacklizard/inertia-express/core`. Each returns a `PropDescriptor` narrowed to the chain methods valid for its kind. Chain methods mutate the descriptor and return it, so build descriptors inside the handler for each request (see [Descriptors are per-request values](/core/props#descriptors-are-per-request-values)).

A bare closure (`() => value`) needs no helper: it is evaluated, and awaited, on each response that includes it.

```ts
type PropSource<T> = T | (() => T | Promise<T>);
type MergePath = boolean | string | string[] | Record<string, string>;
```

---

## `optional(fn)`

Omitted from the initial response; only included when explicitly requested via `X-Inertia-Partial-Data`.

```ts
optional<T>(fn: () => T | Promise<T>): OptionalProp<T>
```

Throws `TypeError` when `fn` is not a function.

| Chain | Returns |
|-------|---------|
| `.once(value?: boolean, as?: string, until?: number \| Date)` | `OptionalProp<T>` |
| `.as(key: string)` | `OptionalProp<T>` |
| `.until(delay: number \| Date)` | `OptionalProp<T>` |
| `.fresh(value?: boolean)` | `OptionalProp<T>` |

```ts
await res.inertia("Dashboard", {
  heavyData: optional(() => analytics.getExpensiveReport()),
});
```

---

## `defer(fn, group?)`

Omitted from the initial response. The client receives the key in `deferredProps` and automatically issues a partial reload after mount.

```ts
defer<T>(fn: () => T | Promise<T>, group?: string): DeferProp<T>
```

| Argument | Default | Description |
|----------|---------|-------------|
| `fn` | — | Value-producing function. Throws `TypeError` when not a function. |
| `group` | `"default"` | Group name. Props in the same group are fetched together. |

| Chain | Returns |
|-------|---------|
| `.merge()` / `.deepMerge()` | `DeferProp<T>` |
| `.append(path?: MergePath, matchOn?: string)` | `DeferProp<T>` |
| `.prepend(path?: MergePath, matchOn?: string)` | `DeferProp<T>` |
| `.matchOn(path: string \| string[])` | `DeferProp<T>` |
| `.once(value?, as?, until?)`, `.as(key)`, `.until(delay)`, `.fresh(value?)` | `DeferProp<T>` |
| `.rescue(value?: boolean)` | `DeferProp<T>` |

`.rescue()` drops the prop from the response when its producer throws, lists its path in `rescuedProps`, and calls the middleware's [`onRescue`](/api/middleware#inertiamiddlewareoptions) hook.

```ts
await res.inertia("Dashboard", {
  charts: defer(() => analytics.getCharts(), "charts"),
  widgets: defer(() => widgets.getAll(), "charts"), // same group — one request
  feed: defer(() => db.feed.findMany(), "feed").rescue(), // different group, failures rescued
  posts: defer(() => db.posts.page(1)).merge().matchOn("id"),
});
```

---

## `always(value)`

Included on every response — full visits **and** partial reloads — regardless of `X-Inertia-Partial-Data` / `X-Inertia-Partial-Except` filtering. Accepts a plain value or a function. No chain methods.

```ts
always<T>(value: PropSource<T>): AlwaysProp<T>
```

```ts
await res.inertia("Dashboard", {
  auth: always(() => ({ user: req.user ?? null })),
});
```

---

## `merge(value)`

The client appends the prop to its existing value at the root instead of replacing it. Accepts a plain value or a function. Exactly one argument: a second argument (the 2.x `matchOn` form) throws `TypeError` — chain `.matchOn()` instead.

```ts
merge<T>(value: PropSource<T>): MergeProp<T>
```

| Chain | Returns |
|-------|---------|
| `.deepMerge()` | `MergeProp<T>` |
| `.append(path?: MergePath, matchOn?: string)` | `MergeProp<T>` |
| `.prepend(path?: MergePath, matchOn?: string)` | `MergeProp<T>` |
| `.matchOn(path: string \| string[])` | `MergeProp<T>` |
| `.once(value?, as?, until?)`, `.as(key)`, `.until(delay)`, `.fresh(value?)` | `MergeProp<T>` |

`append` / `prepend` `path` argument:

| Value | Effect |
|-------|--------|
| `true` (default) / `false` | Root direction. `.prepend(true)` (or `.append(false)`) prepends at the root. |
| `string` | Records a dotted nested path; with `matchOn`, also records `path.matchOn` as a match-on path. |
| `string[]` | Records each path. |
| `Record<string, string>` | Records each key as a path, deduping on its value (`{ data: "id" }`). |

`.matchOn(path)` replaces the list of match-on paths.

```ts
await res.inertia("Feed", {
  posts: merge(() => db.posts.findMany({ page })).matchOn("id"),
  feed: merge({ data: [], pinned: [] }).append({ data: "id" }).prepend("pinned"),
  messages: merge(() => inbox.latest()).prepend(true),
});
```

Emits `mergeProps` (root appends and nested append paths), `prependProps` (root prepends and nested prepend paths) and `matchPropsOn`, each prefixed with the prop path (`"feed.data"`, `"feed.data.id"`).

---

## `deepMerge(value)`

Like `merge`, but the client recursively *deep*-merges the value into the existing prop. Emitted in the page object as `deepMergeProps`. Exactly one argument; a second throws `TypeError`.

```ts
deepMerge<T>(value: PropSource<T>): MergeProp<T>
```

Chains are the same as `merge`.

```ts
await res.inertia("Dashboard", {
  filters: deepMerge({ sort: { field: "name" } }),
  rows: deepMerge(() => db.rows.page(page)).matchOn("id"),
});
```

> **Reset:** when the client sends `X-Inertia-Reset: <key>`, that key is dropped
> from `mergeProps` / `prependProps` / `deepMergeProps` / `matchPropsOn` so the
> prop is replaced instead of merged. The fresh value is still sent.

---

## `once(fn)`

Resolved once and cached by the client across visits. Skipped when the client lists its key in `X-Inertia-Except-Once-Props` (ignored on non-Inertia and partial requests). Listed in `onceProps` as `{ [key]: { prop, expiresAt } }`.

```ts
once<T>(fn: () => T | Promise<T>): OnceProp<T>
```

Throws `TypeError` when `fn` is not a function.

| Chain | Returns | Description |
|-------|---------|-------------|
| `.as(key: string)` | `OnceProp<T>` | Cache key (default: the prop path) |
| `.until(delay: number \| Date)` | `OnceProp<T>` | Expiry: **seconds** from now, or an absolute `Date`. The last call wins. |
| `.fresh(value?: boolean)` | `OnceProp<T>` | Force re-resolution on this response (default `true`) |

```ts
await res.inertia("Settings", {
  plans: once(() => billing.plans()).as("plans").until(3600),
});
```

---

## `scroll(fn, options)`

Infinite-scroll prop: merged at its wrapper key and emitted with pagination metadata in `scrollProps`.

```ts
scroll<T>(fn: () => T | Promise<T>, options: ScrollOptions<T>): ScrollProp<T>

interface ScrollOptions<T> {
  wrapper?: string; // key holding the items; default "data"
  metadata: ScrollMetadata | ((resolved: T) => ScrollMetadata);
}
```

Throws `TypeError` when `fn` is not a function, when `options.metadata` is missing, or (at resolution) when the resolved value lacks the wrapper key.

| Chain | Returns |
|-------|---------|
| `.defer(group?: string)` | `ScrollProp<T>` |
| `.matchOn(path: string \| string[])` | `ScrollProp<T>` |

The wrapper path is emitted under `prependProps` when the client sends `X-Inertia-Infinite-Scroll-Merge-Intent: prepend`, otherwise under `mergeProps`.

```ts
await res.inertia("Posts", {
  posts: scroll(() => postService.page(1), {
    metadata: { pageName: "page", previousPage: null, nextPage: 2, currentPage: 1 },
  }).matchOn("id"),
});
```

---

## `isPropDescriptor(value)`

Type guard: `true` when `value` is a `PropDescriptor` built by any constructor above.

```ts
isPropDescriptor(value: unknown): value is PropDescriptor
```

---

## Type definitions

The per-kind types are narrowed views of `PropDescriptor` exposing only their chain methods:

```ts
interface OptionalProp<T> {
  once: (value?: boolean, as?: string, until?: number | Date) => OptionalProp<T>;
  as: (key: string) => OptionalProp<T>;
  until: (delay: number | Date) => OptionalProp<T>;
  fresh: (value?: boolean) => OptionalProp<T>;
}

interface DeferProp<T> {
  merge: () => DeferProp<T>;
  deepMerge: () => DeferProp<T>;
  append: (path?: MergePath, matchOn?: string) => DeferProp<T>;
  prepend: (path?: MergePath, matchOn?: string) => DeferProp<T>;
  matchOn: (path: string | string[]) => DeferProp<T>;
  once: (value?: boolean, as?: string, until?: number | Date) => DeferProp<T>;
  as: (key: string) => DeferProp<T>;
  until: (delay: number | Date) => DeferProp<T>;
  fresh: (value?: boolean) => DeferProp<T>;
  rescue: (value?: boolean) => DeferProp<T>;
}

interface MergeProp<T> {
  deepMerge: () => MergeProp<T>;
  append: (path?: MergePath, matchOn?: string) => MergeProp<T>;
  prepend: (path?: MergePath, matchOn?: string) => MergeProp<T>;
  matchOn: (path: string | string[]) => MergeProp<T>;
  once: (value?: boolean, as?: string, until?: number | Date) => MergeProp<T>;
  as: (key: string) => MergeProp<T>;
  until: (delay: number | Date) => MergeProp<T>;
  fresh: (value?: boolean) => MergeProp<T>;
}

type AlwaysProp<T> = Pick<PropDescriptor<T>, never>; // no chain methods

interface OnceProp<T> {
  as: (key: string) => OnceProp<T>;
  until: (delay: number | Date) => OnceProp<T>;
  fresh: (value?: boolean) => OnceProp<T>;
}

interface ScrollProp<T> {
  defer: (group?: string) => ScrollProp<T>;
  matchOn: (path: string | string[]) => ScrollProp<T>;
}
```

`MergeProp<T>` is the descriptor returned by both `merge()` and `deepMerge()`; there is no separate deep-merge type. The page `props` type is unchanged: descriptors are assignable to `PageProps` (`Record<string, unknown>`).

### `PropDescriptor`

The class behind every helper, a port of inertia-laravel's prop classes. Exported for adapter authors and `instanceof` checks; application code should use the constructors.

```ts
class PropDescriptor<T = unknown> {
  readonly kind: "optional" | "defer" | "always" | "merge" | "once" | "scroll";
  readonly source: PropSource<T>;

  merge(): this;
  deepMerge(): this;
  append(path?: MergePath, matchOn?: string): this;
  prepend(path?: MergePath, matchOn?: string): this;
  matchOn(path: string | string[]): this;
  defer(group?: string): this;
  once(value?: boolean, as?: string, until?: number | Date): this;
  as(key: string): this;
  until(delay: number | Date): this;
  fresh(value?: boolean): this;
  rescue(value?: boolean): this;
  expiresAt(now?: number): number | null;
  resolveSource(): Promise<T>;
}
```

It also carries the public flags the resolver reads (`ignoreFirstLoad`, `defers`, `group`, `merges`, `deep`, `appends`, `appendPaths`, `prependPaths`, `matchOnPaths`, `resolvesOnce`, `onceKey`, `ttlSeconds`, `expiresAtDate`, `isFresh`, `rescues`, `isAlways`, `isScroll`, `wrapper`, `scrollMetadata`).

---

## `resolveProps(input)` (core)

Low-level function used internally to combine and evaluate props per request. Exported from the core subpath for adapter authors.

```ts
import { resolveProps } from "@blacklizard/inertia-express/core";

resolveProps(input: ResolvePropsInput): Promise<ResolvePropsResult>

interface ResolvePropsInput {
  props: PageProps;          // page props for the component
  shared: PageProps;         // already-evaluated shared props; page props win on collision
  component: string;         // a partial reload only applies when it matches
  request: InertiaRequestInfo;
  onRescue?: RescueHandler;  // (error, path) => void, called for rescued props
}

interface ResolvePropsResult {
  props: PageProps;          // fully resolved props tree
  metadata: PropsMetadata;   // page-level metadata; only non-empty keys are present
}
```

```ts
const { props, metadata } = await resolveProps({
  props: pageProps,
  shared: sharedProps,
  component: "Dashboard",
  request: req.inertia,
});

// metadata.sharedProps    — ["auth"] — top-level shared keys
// metadata.deferredProps  — { groupName: ["key1", "key2"] }
// metadata.mergeProps     — ["key1", "feed.data"] — append paths
// metadata.prependProps   — ["key3"] — prepend paths
// metadata.deepMergeProps — ["key2"] — deep-merge paths
// metadata.matchPropsOn   — ["key1.id"] — dotted match-on paths
// metadata.rescuedProps   — ["feed"] — rescued deferred props
// metadata.scrollProps    — { posts: { pageName, previousPage, nextPage, currentPage, reset } }
// metadata.onceProps      — { plans: { prop: "plans", expiresAt: 1767225600000 } }
```

See [`PropsMetadata`](/api/types#propsmetadata) for the full type.
