# @blacklizard/inertia-express

## 3.0.0

### Major Changes

- 255c323: Port inertia-laravel's prop model and `PropsResolver`. Props are now plain values, bare closures, or chainable descriptors built by `optional`, `defer` (with `.rescue()`), `always`, `merge` / `deepMerge` (with `.append`, `.prepend`, `.matchOn`), `once` (with `.as`, `.until`, `.fresh`) and the new `scroll`. A single resolver, ported from Laravel, evaluates them and emits the page metadata (`deferredProps`, `mergeProps`, `prependProps`, `deepMergeProps`, `matchPropsOn`, `onceProps`, `scrollProps`, `rescuedProps`), including dotted-path partial reloads. New options: `onRescue` on the middleware and `preserveFragment` on `res.inertia()`.

  Migrating from 2.x:

  - `lazy(fn)` is removed; pass the bare closure `fn`.
  - `merge(value, matchOn)` becomes `merge(value).matchOn(matchOn)`.
  - `deepMerge(value, matchOn)` becomes `deepMerge(value).matchOn(matchOn)`.
  - `defer(fn, group)`, `optional(fn)` and `always(fn)` are unchanged.
  - `resolveProps()` now returns `{ props, metadata }` instead of `{ props, deferred, merge, deepMerge, matchOn }`.
  - The `MergeProp<T> = T & {...}` types are replaced by descriptor types; the page `props` type is unchanged.
  - `merge(value, "id")` and `deepMerge(value, "id")` now throw a `TypeError` instead of silently ignoring the second argument. Use `.matchOn("id")`.
  - View-cache hits render the page resolved for the current request and refresh the page script embedded in a cached full-root SSR body, so `url` and `onceProps` expiry are never served stale from the cache.
  - Partial reloads follow dotted paths. `only: users.data` on a plain-object `users` now returns just `{ users: { data } }`; children of a closure or descriptor still bypass filtering and come back whole. `except: users.data` drops the whole top-level `users`, as in 2.x and in the upstream reference server; inertia-laravel keeps `users` and drops only the child, and the adapter deliberately differs from it here.
  - Types: `DeferredProp` is renamed to `DeferProp`. `LazyProp`, `DeepMergeProp` and `PropValue` are removed. `MergeProp<T>` is now the descriptor interface returned by `merge()` / `deepMerge()`, not `T & {...}`.
  - Core-entry adapter authors who build these objects by hand: `InertiaPage.preserveFragment` is now required, and `InertiaRequestInfo` gains the required fields `exceptOnceProps` and `mergeIntent`.
  - `sharedProps` (the list of shared top-level keys) is now emitted on every page that has shared props.
  - Descriptors are builders. Create them inside the handler for each request rather than mutating one hoisted to module level; the resolver itself only reads them, so a hoisted descriptor that is never changed after creation is safe to reuse.
  - Sibling props still resolve concurrently, as in 2.x, and the output key order and metadata order are deterministic (insertion order).
  - Errors thrown by the `onRescue` hook (or a rejected promise it returns) are logged with `console.error` and never propagated.

## 2.0.0

### Major Changes

- 776834d: Surface session flash data as a top-level `flash` page key instead of a prop

  `flashFromSession` previously merged `req.session.flash` into the page **props**
  as `props.flash`. This diverged from the Inertia protocol: inertia-laravel's
  `Response::resolveFlashData` exposes flash as a **top-level** page key (a sibling
  of `props`, `url`, and `version`), and the official client reads it via
  `usePage().flash`. Flash is now emitted there, and the key is omitted entirely
  when there is no flash (matching Laravel's `$flash ? ['flash' => $flash] : []`).

  Validation errors are unchanged — they remain the `errors` shared prop.

  **Migration:** read flash from `usePage().flash` instead of `usePage().props.flash`
  on the client. A page prop you happen to name `flash` (e.g. via `sharedProps` or
  `always()`) is untouched and still lives under `props` — it no longer collides
  with session flash.

## 1.2.0

### Minor Changes

- 8720e3c: Add `res.inertiaError(status, message?)` and `renderErrorPage({ status, message? })`. Inertia requests render the client `Error` component with the status as a prop; plain browser loads and render/SSR failures fall back to a minimal standalone HTML page, so users never see a raw JSON error.

## 1.1.1

### Patch Changes

- Internal cleanup: destructure the entry fields in `viteManifestAssets` so the implementation satisfies `@typescript-eslint/prefer-destructuring`. No behaviour change.

## 1.1.0

### Minor Changes

- Add `viteManifestAssets()` helper that resolves the CSS and JS web URLs for a single Vite manifest entry. Mirrors `viteManifestVersion()`'s shape — returns a lazy `() => Promise<{ css, js }>` with mtime-based caching, and returns `{ css: null, js: null }` when the manifest is missing, unparseable, or the entry key is absent. Saves root-view authors from hand-rolling a manifest reader.

## 1.0.0

### Major Changes

- first
