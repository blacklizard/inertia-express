# Prerendering

Prerendering fetches routes from your running server and either warms the SSR cache or writes static HTML files to disk.

Two output modes (combinable via `mode: "both"`):

| Mode | Description |
|------|-------------|
| `warmup` | Fetches each route, discards the body. Populates the SSR view cache. |
| `static` | Fetches each route, writes the body to `<outDir>/<route>/index.html`. |

## CLI

Installed automatically with the package at `bin/inertia-prerender`:

```bash
inertia-prerender \
  --base-url http://127.0.0.1:3000 \
  --route / \
  --route /about \
  --route /pricing \
  --mode warmup \
  --concurrency 8 \
  --timeout-ms 30000 \
  --header "X-Prerender: 1" \
  --fail-on-error
```

### CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--base-url` | — | Base URL of your running server |
| `--route` | — | Route to prerender. Repeat for multiple routes. |
| `--routes` | — | Path to a JSON file containing an array of route strings |
| `--mode` | `warmup` | `warmup`, `static`, or `both` |
| `--out-dir` | — | Output directory for `static` mode (required when `--mode` includes `static`) |
| `--concurrency` | `4` | Number of concurrent requests |
| `--timeout-ms` | `30000` | Per-route timeout |
| `--header` | — | Extra header (repeat for multiple). Format: `"Name: Value"` |
| `--fail-on-error` | `false` | Exit with non-zero status if any route fails |
| `--quiet` | `false` | Suppress per-route output |

### Routes from a JSON file

```json
["/", "/about", "/pricing", "/features", "/blog"]
```

```bash
inertia-prerender --base-url http://127.0.0.1:3000 --routes routes.json --mode warmup
```

## Programmatic API

```ts
import { prerender } from "@blacklizard/inertia-express";

const summary = await prerender({
  baseUrl: "http://127.0.0.1:3000",
  routes: ["/", "/about", "/pricing"],
  mode: "warmup",
  concurrency: 8,
  timeoutMs: 30_000,
  headers: { "X-Prerender": "1" },
});

console.log(`${summary.ok}/${summary.total} ok, ${summary.failed} failed`);

// Inspect per-route results
for (const result of summary.results) {
  if (result.error || result.status === null || result.status >= 400) {
    console.error(`${result.route}: ${result.error ?? `HTTP ${result.status}`}`);
  }
}
```

The CLI's `--fail-on-error` and `--quiet` are CLI-only — the programmatic API
always returns a summary and never prints. Wire your own exit logic from the
`summary.failed` counter.

### `PrerenderOptions`

```ts
interface PrerenderOptions {
  baseUrl: string;
  routes: string[];
  mode?: "warmup" | "static" | "both";  // default "warmup"
  outDir?: string;                       // required when mode includes "static"
  concurrency?: number;                  // default 4
  timeoutMs?: number;                    // default 30000
  headers?: Record<string, string>;
  fetch?: typeof fetch;                  // override fetch implementation
}
```

### `PrerenderSummary`

```ts
interface PrerenderSummary {
  total: number;
  ok: number;       // routes with a 2xx/3xx status and no error
  failed: number;
  results: PrerenderRouteResult[];
}

interface PrerenderRouteResult {
  route: string;
  status: number | null;   // null when the request failed before producing a response
  bytes: number;           // body size returned by the server
  outputPath?: string;     // set in static mode — where the HTML was written
  error?: string;
  durationMs: number;
}
```

## Deploy workflow

A typical deploy pipeline:

```bash
# 1. Build the app
pnpm build

# 2. Start the server in background
node dist/server.js &
SERVER_PID=$!

# 3. Wait for ready
sleep 2

# 4. Warm the cache
inertia-prerender \
  --base-url http://127.0.0.1:3000 \
  --routes routes.json \
  --mode warmup \
  --fail-on-error

# 5. Route traffic to new server
# ...

kill $SERVER_PID
```

Individual route failures never halt the run — check `summary.failed` or use `--fail-on-error` to fail loudly in CI.
