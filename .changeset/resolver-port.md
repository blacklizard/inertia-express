---
"@blacklizard/inertia-express": major
---

Port inertia-laravel's prop model and `PropsResolver`. Props are now plain values, bare closures, or chainable descriptors built by `optional`, `defer` (with `.rescue()`), `always`, `merge` / `deepMerge` (with `.append`, `.prepend`, `.matchOn`), `once` (with `.as`, `.until`, `.fresh`) and the new `scroll`. A single resolver, ported from Laravel, evaluates them and emits the page metadata (`deferredProps`, `mergeProps`, `prependProps`, `deepMergeProps`, `matchPropsOn`, `onceProps`, `scrollProps`, `rescuedProps`), including dotted-path partial reloads. New options: `onRescue` on the middleware and `preserveFragment` on `res.inertia()`.

Migrating from 2.x:

- `lazy(fn)` is removed; pass the bare closure `fn`.
- `merge(value, matchOn)` becomes `merge(value).matchOn(matchOn)`.
- `deepMerge(value, matchOn)` becomes `deepMerge(value).matchOn(matchOn)`.
- `defer(fn, group)`, `optional(fn)` and `always(fn)` are unchanged.
- `resolveProps()` now returns `{ props, metadata }` instead of `{ props, deferred, merge, deepMerge, matchOn }`.
- The `MergeProp<T> = T & {...}` types are replaced by descriptor types; the page `props` type is unchanged.
- `merge(value, "id")` and `deepMerge(value, "id")` now throw a `TypeError` instead of silently ignoring the second argument. Use `.matchOn("id")`.
- Partial reloads follow dotted paths. `only: users.data` on a plain-object `users` now returns just `{ users: { data } }`; children of a closure or descriptor still bypass filtering and come back whole. `except: users.data` drops the whole top-level `users`, as in 2.x and in the upstream reference server; inertia-laravel keeps `users` and drops only the child, and the adapter deliberately differs from it here.
- Types: `DeferredProp` is renamed to `DeferProp`. `LazyProp`, `DeepMergeProp` and `PropValue` are removed. `MergeProp<T>` is now the descriptor interface returned by `merge()` / `deepMerge()`, not `T & {...}`.
- Core-entry adapter authors who build these objects by hand: `InertiaPage.preserveFragment` is now required, and `InertiaRequestInfo` gains the required fields `exceptOnceProps` and `mergeIntent`.
- `sharedProps` (the list of shared top-level keys) is now emitted on every page that has shared props.
- Descriptors are builders. Create them inside the handler for each request rather than mutating one hoisted to module level; the resolver itself only reads them, so a hoisted descriptor that is never changed after creation is safe to reuse.
- Sibling props still resolve concurrently, as in 2.x, and the output key order and metadata order are deterministic (insertion order).
- Errors thrown by the `onRescue` hook (or a rejected promise it returns) are logged with `console.error` and never propagated.
