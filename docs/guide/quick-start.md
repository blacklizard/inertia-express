# Quick Start

A minimal Express + Inertia server in under 30 lines.

## 1. Install

```bash
pnpm add @blacklizard/inertia-express express
```

## 2. Mount the middleware

```ts
// server/index.ts
import express from "express";
import { inertia } from "@blacklizard/inertia-express";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  inertia({
    version: () => process.env.ASSET_VERSION ?? null,
    sharedProps: (req) => ({
      auth: { user: req.user ?? null },
    }),
    // Auto-promotes req.session.flash / req.session.errors into props.
    flashFromSession: true,
  }),
);
```

::: tip Migrating from `connect-flash`?
`req.flash()` is built in — see [Flash messages](/core/redirects#flash-messages). Remove the `connect-flash` dependency; the two clash on `req.session.flash`.
:::

## 3. Render a page

```ts
app.get("/users", async (req, res) => {
  await res.inertia("Users/Index", {
    users: await db.users.findMany(),
  });
});

app.listen(3000);
```

## 4. Wire up the client (Vue 3 example)

```ts
// client/main.ts
import { createApp, h } from "vue";
import { createInertiaApp } from "@inertiajs/vue3";

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob("../pages/**/*.vue", { eager: true });
    return pages[`../pages/${name}.vue`];
  },
  setup({ el, App, props, plugin }) {
    createApp({ render: () => h(App, props) })
      .use(plugin)
      .mount(el);
  },
});
```

## 5. Add a root view

By default, the middleware emits a minimal HTML shell. Replace it with your own template:

```ts
inertia({
  rootView: ({ page }) => `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>My App</title>
      </head>
      <body>
        <div id="app"></div>
        <script data-page="app" type="application/json">${JSON.stringify(page).replace(/</g, "\\u003C")}</script>
        <script type="module" src="/build/app.js"></script>
      </body>
    </html>
  `,
});
```

## Next steps

- [Middleware configuration](/core/middleware) — all available options
- [Props](/core/props) — lazy, optional, deferred, and merge props
- [SSR](/advanced/ssr) — server-side rendering setup
- [Examples](/examples/vue) — full working examples
