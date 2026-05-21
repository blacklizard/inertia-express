# Express + Vue 3 + Inertia — Production Example

End-to-end production setup. Web tier and SSR tier are independent services. Provider-agnostic — runs the same way on local Docker, DigitalOcean App Platform, AWS ECS, Alibaba Cloud Container Service, k8s, or a plain VM with Compose.

## Components

```
                  [ public LB / CDN ]
                          │
                  ┌───────▼───────┐
                  │  web (N pods) │   ← Express + @blacklizard/inertia-express
                  │   - SSR fetch │      - L1 LRU + L2 Redis cache
                  │   - L1 cache  │      - circuit-breaker fetcher
                  │   - LB → SSR  │      - viteManifestVersion
                  └───┬─────────┬─┘
                      │         │
       ┌──────────────▼┐      ┌─▼─────────┐
       │ redis (cache) │      │ ssr (N)   │  ← @blacklizard/inertia-ssr-worker
       └───────────────┘      │  /health  │     - self-recycle (req/uptime/RSS)
                              │  /ready   │     - graceful drain on SIGTERM
                              │  /render  │
                              └───────────┘
```

## Run locally

```bash
# From the repo root
pnpm install
pnpm -r --filter "./packages/*" build

# From this directory
pnpm build              # build client + ssr bundles
docker compose up --build
# → http://localhost:3000
```

## Per-tier env vars

### web

| Var             | Default                                   | Notes                                   |
| --------------- | ----------------------------------------- | --------------------------------------- |
| `PORT`          | `3000`                                    |                                         |
| `SSR_URL`       | `http://127.0.0.1:13714/render`          | LB DNS or single SSR pod                |
| `REDIS_URL`     | (unset → memory only)                    | `redis://host:6379`                     |
| `CACHE_PREFIX`  | `inertia`                                 | Namespace for shared Redis              |
| `MANIFEST_PATH` | `./dist/client/.vite/manifest.json`      | Drives version + cache invalidation     |

### ssr

| Var                    | Default | Notes                                          |
| ---------------------- | ------- | ---------------------------------------------- |
| `SSR_PORT`             | `13714` |                                                |
| `SSR_MAX_REQUESTS`     | `1000`  | 0 = disabled                                   |
| `SSR_MAX_LIFETIME_SEC` | `3600`  | 0 = disabled                                   |
| `SSR_MAX_RSS_MB`       | `512`   | 0 = disabled                                   |

## Production deploy patterns

The two Dockerfiles produce two images. How you wire them is up to your platform:

- **DigitalOcean App Platform**: two services (`web`, `ssr`). Add a managed Redis. Internal SSR URL: `http://ssr:13714/render`.
- **AWS ECS / EKS**: two task definitions, two target groups behind ALBs (one public for `web`, one internal for `ssr`).
- **Alibaba Cloud Container Service**: same pattern — public SLB + internal SLB.
- **k8s**: two deployments + two services. SSR deployment has liveness probe `GET /health`, readiness probe `GET /ready`.
- **Plain VM + Compose**: this directory's `docker-compose.yml`.

The adapter and worker assume nothing about the platform. They speak HTTP.

## Cache invalidation on deploy

Cache keys include the asset version (computed from Vite's `manifest.json`). Any deploy that produces new file hashes automatically retires every existing cache entry — no flush, no race. Old entries TTL out.

## Self-healing

Each SSR pod recycles after `SSR_MAX_REQUESTS`, `SSR_MAX_LIFETIME_SEC`, or `SSR_MAX_RSS_MB`. Sequence:

1. `/health` flips to 503 → LB stops sending new requests
2. In-flight `/render` calls drain
3. `process.exit(0)`
4. Supervisor (Docker / ECS / k8s) starts a replacement

The `web` tier's circuit breaker absorbs the transient unavailability while the LB rotates to a healthy peer.

## Pre-render at deploy time

Run as a deploy-pipeline step after smoke tests pass:

```bash
# Warm the SSR cache for high-traffic routes
node ../../packages/inertia-express/bin/inertia-prerender.mjs \
  --base-url https://example.com \
  --route / \
  --route /about \
  --mode warmup

# Or generate static HTML for fully-public marketing Pages
node ../../packages/inertia-express/bin/inertia-prerender.mjs \
  --base-url https://example.com \
  --routes ./public-routes.json \
  --mode static \
  --out-dir ./prerendered
```

Then upload `./prerendered/` to a CDN/object storage (S3, Spaces, OSS) and let your edge cache serve it.

## Observability hooks

- `cache.onError` (web): log Redis failures, swallow them.
- `breaker` events: surface via your APM (the fetcher's state can be inspected by reading metrics counters around it).
- `onRecycle` (ssr): emit a metric per recycle, alert on rate.
- `/healthz` (web), `/health` and `/ready` (ssr): wire to your platform's probes.
