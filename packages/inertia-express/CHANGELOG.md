# @blacklizard/inertia-express

## 1.1.1

### Patch Changes

- Internal cleanup: destructure the entry fields in `viteManifestAssets` so the implementation satisfies `@typescript-eslint/prefer-destructuring`. No behaviour change.

## 1.1.0

### Minor Changes

- Add `viteManifestAssets()` helper that resolves the CSS and JS web URLs for a single Vite manifest entry. Mirrors `viteManifestVersion()`'s shape — returns a lazy `() => Promise<{ css, js }>` with mtime-based caching, and returns `{ css: null, js: null }` when the manifest is missing, unparseable, or the entry key is absent. Saves root-view authors from hand-rolling a manifest reader.

## 1.0.0

### Major Changes

- first
