# @blacklizard/inertia-cache-redis

[![CI](https://github.com/blacklizard/inertia-express/actions/workflows/ci.yml/badge.svg)](https://github.com/blacklizard/inertia-express/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@blacklizard/inertia-cache-redis.svg)](https://www.npmjs.com/package/@blacklizard/inertia-cache-redis)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >= 24](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)

Redis-backed SSR view cache store for [@blacklizard/inertia-express](../inertia-express). Compatible with [`node-redis` v4+](https://github.com/redis/node-redis) and `ioredis`.

## Install

```bash
pnpm add @blacklizard/inertia-cache-redis redis
```

## Usage

```ts
import express from "express";
import { createClient } from "redis";
import { inertia, viteManifestVersion } from "@blacklizard/inertia-express";
import { createRedisCacheStore } from "@blacklizard/inertia-cache-redis";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const app = express();
app.use(
  inertia({
    version: viteManifestVersion({ manifestPath: "./dist/client/manifest.json" }),
    ssr: yourSsrFetcher,
    cache: {
      store: createRedisCacheStore({
        client: redis,
        keyPrefix: "myapp:prod",
        onError: (op, err) => console.warn(`redis cache ${op} failed`, err),
      }),
      ttlSeconds: 600,
    },
  }),
);
```

## ioredis

Pass `setMode: "ioredis"`:

```ts
import Redis from "ioredis";
import { createRedisCacheStore } from "@blacklizard/inertia-cache-redis";

const client = new Redis(process.env.REDIS_URL);

createRedisCacheStore({ client, setMode: "ioredis" });
```

## Cache invalidation on deploy

Cache keys include the asset version. On deploy, a new version automatically retires every existing entry with no manual flush. Old keys expire via TTL.
