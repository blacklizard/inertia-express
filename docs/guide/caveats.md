---
outline: deep
---

# Caveats

This page lists behaviour that surprises people coming from inertia-laravel or from 2.x of this adapter. Each entry says what happens, why it was chosen, and what to do instead.

### Nested except drops the parent

`X-Inertia-Partial-Except: users.data` removes `users` entirely, with all of its metadata, not just `users.data`. This matches 2.x and the upstream reference Node server; inertia-laravel keeps `users` and drops only the child, and the adapter deliberately differs from it here. To refresh a plain-object parent while skipping one child, list the siblings in `only` instead.

```ts
// Refresh users.meta and users.links, leave users.data alone
router.reload({ only: ["users.meta", "users.links"] });
```

### Child partials skip parent merge metadata

A partial reload that asks for a child path does not emit merge metadata for a merge prop above it. With `users: merge(...)` and `only: ["users.data"]`, `users` comes back in `props` but is not listed in `mergeProps`, so the client replaces it rather than merging. This mirrors inertia-laravel's `PropsResolver`. Request the merge prop by its own path (`only: ["users"]`) when you want it merged.

### Arrays stay arrays

Excluded entries inside arrays are dropped and the array stays a JSON array. With `foos: [{ bar: optional(fn) }]`, an initial load omits `bar` from each element; an array whose entries are themselves excluded descriptors loses those entries, and later indices shift down. PHP keeps the original keys, so inertia-laravel would serialise such an array as an object. Metadata paths and `except` matching use the original indices, so once an earlier entry is dropped a path such as `foos.2.bar` no longer lines up with the output index.

```ts
await res.inertia("Foos", { foos: [{ name: "First", bar: optional(() => load()) }] });
// initial load → props.foos = [{ name: "First" }]
```

### Descriptors are mutable

Every chain method mutates the descriptor and returns the same object. Build descriptors inside the handler; a module-level descriptor that you chain on per request accumulates configuration across requests. The resolver itself never writes to a descriptor, so a hoisted descriptor that is never chained on again is safe. See [Descriptors are per-request values](/core/props#descriptors-are-per-request-values).

```ts
const feed = merge(() => db.posts.latest()); // hoisted
app.get("/feed", (req, res) => res.inertia("Feed", { feed: feed.matchOn("id") })); // wrong: mutates the shared object
```

### Merge takes one argument

`merge(value, "id")` throws a `TypeError` instead of ignoring the 2.x second argument, so a migrating call site fails loudly rather than silently losing its dedupe key. The same applies to `deepMerge`. Chain `.matchOn()` instead; the full mapping is in [Migrating from 2.x](/core/props#migrating-from-2-x).

```ts
merge(posts, "id"); // TypeError
merge(posts).matchOn("id"); // 3.0
```

### View cache ignores the URL

The [view cache](/advanced/caching) key is the prefix, the asset version, the component, the canonicalised props and the optional `discriminator`; the request URL is not part of it. Two routes that render the same component with identical props share one cached SSR body, so URL-dependent markup such as active-link state is shared too. The embedded page object is always the live one for the current request (`url`, `onceProps`); only the markup is reused. Return `req.path` from `cache.discriminator` to key by URL, or return `false` from `cache.vary` to skip caching for those requests.

```ts
inertia({
  cache: { store, discriminator: (req) => req.path },
});
```

### Errors need flashFromSession

The `errors` shared prop is injected only when [`flashFromSession`](/core/middleware#flashfromsession) is on. Without it, no `errors` prop is added, `sharedProps` does not list it, and errors recorded with `res.inertiaErrors()` never reach the page. Either turn the option on or pass validation errors yourself through `sharedProps` or the page props.

### onRescue failures are swallowed

If the `onRescue` hook throws or returns a rejected promise, the error is logged with `console.error` and never propagates. The prop is still rescued and listed in `rescuedProps`. Do the hook's own error handling inside it if a failed report must be noticed.

### Nested closures resolve in stages

Direct siblings (closures or descriptors under the same object) start together and resolve concurrently. Closures under different plain-object parents (cousins) start only after the earlier sibling has settled, so two slow closures in separate nested objects take the sum of their times. Output key order and metadata order follow insertion order either way. 2.x never walked nested closures, so this only costs anything for closures you newly nest; hoist slow independent closures to the same level when latency matters.

```ts
// a.x and b.y run one after the other; x and y as siblings would run together
await res.inertia("Page", { a: { x: () => slowX() }, b: { y: () => slowY() } });
```

### Not yet ported

Live props (`broadcastProps` and the `liveProps` page metadata) are planned, not in 3.0.0. Two of inertia-laravel's middleware rules are also planned, not in 3.0.0: answering a redirect whose target has a URL fragment with 409 and `X-Inertia-Redirect`, and turning an empty 200 response into a redirect back. Redirects after `PUT`, `PATCH` and `DELETE` are already promoted to 303.

### Infinite scroll is not demoed

`scroll()` is server-ready: it emits `scrollProps` and honours `X-Inertia-Infinite-Scroll-Merge-Intent`. No example app has an infinite-scroll page yet, so the client side of the round trip is not demonstrated in this repository.
