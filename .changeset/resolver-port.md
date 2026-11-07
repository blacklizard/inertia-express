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
