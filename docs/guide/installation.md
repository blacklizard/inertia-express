# Installation

## Requirements

- Node.js >= 24
- Express 4 or 5 (peer dependency; the package is tested against Express 5)
- pnpm / npm / yarn

## Install the adapter

```bash
# pnpm
pnpm add @blacklizard/inertia-express

# npm
npm install @blacklizard/inertia-express

# yarn
yarn add @blacklizard/inertia-express
```

`express` is a peer dependency — install it separately if you haven't:

```bash
pnpm add express
pnpm add -D @types/express  # if using TypeScript
```

## Optional packages

### Redis view cache

For multi-process or multi-pod deployments where you want a shared SSR cache:

```bash
pnpm add @blacklizard/inertia-cache-redis
pnpm add redis  # node-redis v4+
```

Or with ioredis:

```bash
pnpm add @blacklizard/inertia-cache-redis ioredis
```

### Out-of-process SSR worker

Run SSR in a separate process pool for production stability:

```bash
pnpm add @blacklizard/inertia-ssr-worker
```

## TypeScript setup

The package ships its own type declarations and automatically augments Express types via [declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html).

Make sure your `tsconfig.json` targets ES2022 or later and uses `NodeNext` or `Bundler` module resolution:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true
  }
}
```

No additional type imports are required — `req.inertia`, `res.inertia()`, `res.inertiaLocation()`, and `res.inertiaErrors()` are typed as soon as `@blacklizard/inertia-express` is imported anywhere in your project.

## ESM

This package is ESM-only. Your project must have `"type": "module"` in `package.json`, or use `.mts` / `.mjs` extensions for files that import it.

```json
{
  "type": "module"
}
```
