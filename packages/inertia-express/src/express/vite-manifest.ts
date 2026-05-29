import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

/**
 * Inputs to {@link viteManifestVersion}.
 */
export interface ViteManifestVersionOptions {
  /** Path to `manifest.json`. */
  manifestPath: string;
  /**
   * If `true` (default), the manifest is re-read on every call when its
   * mtime has advanced. Set to `false` to read once on boot — slightly
   * faster but requires a process restart to pick up new builds.
   */
  watchMtime?: boolean;
}

/**
 * Inputs to {@link viteManifestAssets}.
 */
export interface ViteManifestAssetsOptions {
  /** Path to `manifest.json`. */
  manifestPath: string;
  /**
   * Manifest key for the entry to resolve. Typically the source path of
   * the client entry, e.g. `src/app.ts` or `src/main.tsx`.
   */
  entry: string;
  /**
   * If `true` (default), the manifest is re-read on every call when its
   * mtime has advanced. Set to `false` to read once on boot.
   */
  watchMtime?: boolean;
}

/**
 * Resolved asset URLs for a single Vite manifest entry. URLs are web paths
 * with a leading `/`, ready to drop into the HTML shell.
 */
export interface ViteManifestAssets {
  /** First CSS file declared by the entry, or `null` when absent. */
  css: string | null;
  /** Compiled JS file for the entry, or `null` when absent. */
  js: string | null;
}

interface CacheEntry {
  mtimeMs: number;
  version: string;
}

interface AssetsCacheEntry {
  mtimeMs: number;
  assets: ViteManifestAssets;
}

const EMPTY_ASSETS: ViteManifestAssets = { css: null, js: null };

/**
 * Build a stable asset version from a Vite-generated `manifest.json`.
 *
 * Compatible with both `@inertiajs/vite-plugin` output and the standard
 * `--manifest` option from `vite build`. The returned function is suitable
 * to pass directly as the `version` option of the Inertia middleware.
 *
 * Strategy:
 *   - Read the manifest file.
 *   - Hash a canonicalized list of `(key -> file)` entries (only the `file`
 *     field per entry, so unrelated manifest metadata never perturbs the hash).
 *   - Cache the result; re-read only after the file's mtime changes (when
 *     `watchMtime` is true) or never re-read (when false).
 *   - Returns `null` when the manifest file is absent or unparseable.
 *
 * A new manifest (different hashed output paths) yields a new version, which
 * the middleware embeds in the SSR cache key — so a deploy atomically
 * invalidates every existing cache entry.
 *
 * @param options Path to the manifest plus the mtime-watch flag.
 */
export function viteManifestVersion(options: ViteManifestVersionOptions): () => Promise<string | null> {
  const watchMtime = options.watchMtime ?? true;
  let cached: CacheEntry | null = null;

  /**
   * Resolve to the current version string, or `null` when the manifest can't
   * be read or parsed. Hits the in-memory cache when the mtime is unchanged.
   */
  async function read(): Promise<string | null> {
    let mtimeMs: number;

    try {
      const s = await stat(options.manifestPath);
      mtimeMs = s.mtimeMs;
    } catch {
      return null;
    }

    if (cached && (!watchMtime || cached.mtimeMs === mtimeMs)) {
      return cached.version;
    }

    let raw: string;

    try {
      raw = await readFile(options.manifestPath, 'utf8');
    } catch {
      return null;
    }

    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }

    // Canonical input: keys sorted, value extracts the `file` property when
    // the entry is a Vite manifest object (so unrelated metadata doesn't
    // perturb the hash).
    const lines: string[] = Object.keys(parsed)
      .sort()
      .map((key) => {
        const entry = parsed[key];

        if (entry && typeof entry === 'object' && 'file' in entry) {
          return `${key}=${(entry as { file: string }).file}`;
        }

        return `${key}=${JSON.stringify(entry)}`;
      });

    const version = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);

    cached = { mtimeMs, version };

    return version;
  }

  return read;
}

/**
 * Web-path normalize a manifest-relative file string. Adds a leading `/`
 * and collapses any pre-existing leading slashes so the result is always
 * a single-rooted absolute web path.
 *
 * @param file Manifest-relative file string.
 */
function toWebPath(file: string): string {
  return `/${file.replace(/^\/+/, '')}`;
}

/**
 * Resolve the asset URLs (`css`, `js`) for a single Vite manifest entry.
 *
 * Reads the manifest produced by `vite build --manifest` (or
 * `@inertiajs/vite-plugin`), locates the entry by manifest key, and
 * returns its compiled JS file plus the first declared CSS file as web
 * paths suitable to drop into the HTML shell's `<link>` and `<script>`
 * tags. Caches by mtime the same way as {@link viteManifestVersion}.
 *
 * Returns `{ css: null, js: null }` when the manifest is missing,
 * unparseable, or the entry key is absent — the root view stays
 * renderable while assets are still being built.
 *
 * @param options Path to the manifest, entry key, and the mtime-watch flag.
 */
export function viteManifestAssets(
  options: ViteManifestAssetsOptions,
): () => Promise<ViteManifestAssets> {
  const watchMtime = options.watchMtime ?? true;
  let cached: AssetsCacheEntry | null = null;

  /**
   * Resolve to the current asset URLs, or `{ css: null, js: null }` when
   * the manifest can't be read, parsed, or the entry is missing.
   */
  async function read(): Promise<ViteManifestAssets> {
    let mtimeMs: number;

    try {
      const s = await stat(options.manifestPath);
      mtimeMs = s.mtimeMs;
    } catch {
      return EMPTY_ASSETS;
    }

    if (cached && (!watchMtime || cached.mtimeMs === mtimeMs)) {
      return cached.assets;
    }

    let raw: string;

    try {
      raw = await readFile(options.manifestPath, 'utf8');
    } catch {
      return EMPTY_ASSETS;
    }

    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return EMPTY_ASSETS;
    }

    const entry = parsed[options.entry];

    if (!entry || typeof entry !== 'object') {
      return EMPTY_ASSETS;
    }

    const { file, css: cssList } = entry as { file?: unknown; css?: unknown };
    const firstCss = Array.isArray(cssList) && typeof cssList[0] === 'string' ? cssList[0] : null;

    const assets: ViteManifestAssets = {
      css: firstCss !== null ? toWebPath(firstCss) : null,
      js: typeof file === 'string' ? toWebPath(file) : null,
    };

    cached = { mtimeMs, assets };

    return assets;
  }

  return read;
}
