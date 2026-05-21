# @blacklizard/inertia-ssr-worker

[![CI](https://github.com/blacklizard/inertia-express/actions/workflows/ci.yml/badge.svg)](https://github.com/blacklizard/inertia-express/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@blacklizard/inertia-ssr-worker.svg)](https://www.npmjs.com/package/@blacklizard/inertia-ssr-worker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >= 24](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)

Production SSR worker for Inertia.js v3. Wraps your `render(page)` function in an HTTP server with health/readiness endpoints, request/uptime/RSS-based recycling, and graceful drain on `SIGTERM`/`SIGINT`.

Drop-in replacement for the bare `@inertiajs/{vue3,react,svelte}/server` `createServer` when you need to put SSR behind a load balancer.

## Install

```bash
pnpm add @blacklizard/inertia-ssr-worker
```

## Usage — Vue

```ts
import { createInertiaApp } from "@inertiajs/vue3";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h } from "vue";
import { createInertiaSsrWorker } from "@blacklizard/inertia-ssr-worker";

createInertiaSsrWorker({
  port: Number(process.env.SSR_PORT ?? 13714),
  maxRequests: 1000,
  maxLifetimeSec: 3600,
  maxRssMb: 512,
  async render(page) {
    const result = (await createInertiaApp({
      page,
      render: renderToString,
      resolve: (name) => import.meta.glob("./Pages/*.vue", { eager: true })[`./pages/${name}.vue`],
      setup({ App, props, plugin }) {
        return createSSRApp({ render: () => h(App, props) }).use(plugin);
      },
    })) as { head: string[]; body: string };
    return { ...result, bodyIsFullRoot: true };
  },
});
```

## HTTP surface

| Path        | Method | Purpose                                            |
| ----------- | ------ | -------------------------------------------------- |
| `/render`   | POST   | Body = page JSON. Response `{ head, body, bodyIsFullRoot? }`. Returns 503 when draining. |
| `/health`   | GET    | 200 normally, 503 once draining starts. Use for LB health checks. |
| `/ready`    | GET    | 200 once the server is listening. Use for LB readiness checks.    |

## Self-healing

Worker recycles itself when any of these triggers fire:

- Served `>=` `maxRequests` requests
- Process uptime `>=` `maxLifetimeSec` seconds
- `process.memoryUsage().rss` `>=` `maxRssMb` MB

Recycle sequence:
1. `/health` flips to 503 immediately
2. LB stops sending new requests
3. In-flight `/render` calls finish (or `drainTimeoutMs` elapses)
4. `process.exit(0)`
5. Supervisor (PM2, systemd, Docker, k8s, etc.) starts a replacement

Set any limit to `0` to disable that trigger.

## Load-balancer wiring

Provider-agnostic. Examples:

- **DigitalOcean App Platform / k8s**: deploy as a separate service, configure liveness probe `GET /health`, readiness probe `GET /ready`.
- **AWS ECS / EKS**: ALB target group with health check path `/health`.
- **Plain VM behind nginx**: nginx upstream pool, `proxy_next_upstream` for retries.
- **PM2 cluster**: each worker in cluster mode, PM2 restarts on exit.

The worker doesn't care — it speaks plain HTTP and exits cleanly.

## Graceful shutdown

Receives `SIGTERM`/`SIGINT` → drains in-flight calls → exits 0. Works out of the box with Docker `STOPSIGNAL SIGTERM` (the default).

## Restarting workers gracefully on deploy

The worker is stateless — restarts produce no data loss. The job is to swap pods without dropping in-flight `/render` calls or returning errors to the LB.

### Shutdown sequence (what the worker does on SIGTERM)

1. `/health` flips to `503` immediately. LB stops routing new requests after its next probe.
2. New `/render` requests get `503 Service Unavailable` (orchestrator retries / LB sheds).
3. In-flight `/render` calls run to completion, up to `drainTimeoutMs` (default `10000` ms).
4. HTTP server closes. `process.exit(0)`.
5. Supervisor starts the replacement pod, which begins serving once `/ready` returns 200.

### Required orchestrator settings

| Setting | Value | Why |
| ------- | ----- | --- |
| Liveness probe | `GET /health` | Detects hung workers. |
| Readiness probe | `GET /ready` | Keeps pre-listen pods out of the LB pool. |
| `terminationGracePeriodSeconds` (k8s) / `stopTimeout` (ECS) / `stop_grace_period` (Compose) | `>= drainTimeoutMs / 1000 + 5` | Lets the worker finish draining before the orchestrator sends `SIGKILL`. With default `drainTimeoutMs=10000`, set ≥ `15`. |
| Health-probe interval | `<= 5s` | LB notices the 503 fast and stops sending traffic. Tune `failureThreshold` / `unhealthyThresholdCount` to `1` for fastest drain. |
| `STOPSIGNAL` | `SIGTERM` (Docker default) | Required — the worker only drains on SIGTERM/SIGINT. |
| Rolling-update strategy | `maxUnavailable: 0` (k8s) / `minimumHealthyPercent: 100` (ECS) | New replicas come up before old ones go down → no capacity dip. |

### Rolling deploy (recommended)

Bring up new pods alongside old ones. Once new pods report ready, the orchestrator sends `SIGTERM` to old pods one at a time. The drain sequence above runs per pod. Zero downtime.

- **k8s**: `kubectl rollout restart deployment/<ssr>` — uses the deployment's RollingUpdate strategy.
- **ECS**: update service with new task definition, `deploymentConfiguration: { minimumHealthyPercent: 100, maximumPercent: 200 }`.
- **DigitalOcean App Platform**: redeploy — App Platform uses rolling by default.
- **Docker Compose**: `docker compose up -d --build --no-deps ssr` with `deploy.update_config: { order: start-first }`.

### Manual restart (single pod)

```bash
# Sends SIGTERM. Worker drains then exits 0. Supervisor restarts it.
kill -TERM <pid>
docker kill --signal=SIGTERM <container>
kubectl delete pod <pod>           # k8s sends SIGTERM, then SIGKILL after grace period
```

Do NOT use `kill -9` / `docker kill` (default `SIGKILL`) / `pkill -9` — bypasses drain, drops in-flight renders.

### Forcing a recycle without redeploy

Set tight limits so workers self-recycle on their own cadence — useful between deploys:

```ts
createInertiaSsrWorker({
  maxRequests: 1000,        // recycle every 1k requests
  maxLifetimeSec: 3600,     // or every hour
  maxRssMb: 512,            // or when RSS gets fat
  drainTimeoutMs: 10000,
  render: ...,
});
```

Hook `onRecycle` to emit metrics and alert if recycle rate spikes (memory leak signal).

### Cache invalidation on deploy

Cache keys are namespaced by asset version (Vite manifest hash). New build → new hashes → old keys become unreachable and TTL out. No flush needed, no race between old and new pods sharing a Redis.

## Testing

Pass `autoExit: false` so `process.exit` isn't called from your test runner:

```ts
const worker = createInertiaSsrWorker({ render: ..., autoExit: false });
```
