# Vue 3 Example

A minimal Express + Inertia + Vue 3 setup with Vite for development.

Full source: [`examples/express-vue/`](https://github.com/blacklizard/inertia-express/tree/main/examples/express-vue)

## Dependencies

```bash
pnpm add express @blacklizard/inertia-express
pnpm add @inertiajs/vue3 vue
pnpm add -D vite @vitejs/plugin-vue typescript tsx
```

## Server

```ts
// server/index.ts
import { defer, inertia, lazy } from "@blacklizard/inertia-express";
import express from "express";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  inertia({
    version: () => "1",
    sharedProps: () => ({
      auth: { user: { name: "Demo User" } },
    }),
    rootView: ({ page }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inertia Vue Example</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="application/json" data-page="app">${JSON.stringify(page).replace(/</g, "\\u003C")}</script>
    <script type="module" src="http://localhost:5173/@vite/client"></script>
    <script type="module" src="http://localhost:5173/client/main.ts"></script>
  </body>
</html>`,
  }),
);

app.get("/", async (_req, res) => {
  await res.inertia("Home", {
    greeting: "Hello from Express + Inertia + Vue",
    timestamp: lazy(() => new Date().toISOString()),
    stats: defer(async () => {
      await new Promise((r) => setTimeout(r, 250));
      return { computed: true };
    }, "secondary"),
  });
});

app.listen(3000, () => console.log("http://localhost:3000"));
```

## Client entry

```ts
// client/main.ts
import { createApp, h } from "vue";
import { createInertiaApp } from "@inertiajs/vue3";

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob("../pages/**/*.vue", { eager: true });
    return pages[`../pages/${name}.vue`] as object;
  },
  setup({ el, App, props, plugin }) {
    createApp({ render: () => h(App, props) })
      .use(plugin)
      .mount(el);
  },
});
```

## Vite config

```ts
// vite.config.ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

## Running

Start both servers concurrently:

```bash
# Terminal 1 — Express server
npx tsx watch server/index.ts

# Terminal 2 — Vite dev server
npx vite
```

Or with `concurrently`:

```bash
pnpm add -D concurrently
```

```json
{
  "scripts": {
    "dev": "concurrently \"tsx watch server/index.ts\" \"vite\""
  }
}
```

## Home page component

```vue
<!-- pages/Home.vue -->
<script setup lang="ts">
defineProps<{
  greeting: string;
  timestamp: string;
  auth: { user: { name: string } };
}>();
</script>

<template>
  <div>
    <h1>{{ greeting }}</h1>
    <p>Rendered at: {{ timestamp }}</p>
    <p>Logged in as: {{ auth.user.name }}</p>
  </div>
</template>
```
