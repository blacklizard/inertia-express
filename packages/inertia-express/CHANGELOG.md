# @blacklizard/inertia-express

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
