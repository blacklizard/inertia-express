# Asset Versioning

Asset versioning tells the Inertia client when to do a full reload because its cached JavaScript/CSS bundles are stale.

## How it works

1. The server reports the current asset version via `X-Inertia-Version` in every JSON response.
2. The client tracks the version it loaded with.
3. On a `GET` Inertia request, if the client's version doesn't match the server's, the middleware responds `409 + X-Inertia-Location: <same-url>`.
4. The Inertia client performs `window.location = url`, triggering a full reload that fetches fresh assets.

## Configuration

Pass a `version` option to `inertia()`:

```ts
inertia({
  version: "abc123",
});
```

Or a function (evaluated per request):

```ts
inertia({
  version: () => process.env.ASSET_VERSION ?? null,
});
```

`null` (the default) disables version mismatch detection.

## `viteManifestVersion(options)`

For Vite-built apps, `viteManifestVersion` reads the Vite manifest and returns a hash that changes whenever any built asset changes. This is the recommended approach — it automatically invalidates the client on every deploy without manual version management.

```ts
import { inertia, viteManifestVersion } from "@blacklizard/inertia-express";

app.use(
  inertia({
    version: viteManifestVersion({
      manifestPath: "public/build/.vite/manifest.json",
      watchMtime: true,
    }),
  }),
);
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `manifestPath` | — | Path to the Vite manifest JSON file |
| `watchMtime` | `true` | Re-read the file when its mtime changes. Set `false` to read once on boot (requires process restart on new builds) |

### Interaction with SSR cache

The asset version is incorporated into SSR cache keys. When a deploy bumps the version, every existing cache entry is retired automatically — no manual cache invalidation needed.

## Manual version management

Read the manifest or any build artifact yourself:

```ts
import { readFileSync } from "node:fs";

inertia({
  version: () => {
    try {
      return readFileSync("public/build/manifest.json", "utf8");
    } catch {
      return null;
    }
  },
});
```

Hashing the manifest contents works well:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function manifestHash() {
  const content = readFileSync("public/build/manifest.json", "utf8");
  return createHash("md5").update(content).digest("hex").slice(0, 8);
}

inertia({
  version: manifestHash,
});
```
