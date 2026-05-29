# @blacklizard/inertia-express

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
