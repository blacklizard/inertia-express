# React Example

Express + Inertia + React setup with Vite for development.

Full source: [`examples/express-react/`](https://github.com/blacklizard/inertia-express/tree/main/examples/express-react)

## Dependencies

```bash
pnpm add express @blacklizard/inertia-express
pnpm add @inertiajs/react react react-dom
pnpm add -D vite @vitejs/plugin-react typescript tsx @types/react @types/react-dom
```

## Server

```ts
// server/index.ts
import { inertia } from "@blacklizard/inertia-express";
import express from "express";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  inertia({
    version: () => process.env.ASSET_VERSION ?? null,
    sharedProps: () => ({
      auth: { user: { name: "Demo User" } },
    }),
    rootView: ({ page }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inertia React Example</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="application/json" data-page="app">${JSON.stringify(page).replace(/</g, "\\u003C")}</script>
    <script type="module" src="http://localhost:5173/@vite/client"></script>
    <script type="module" src="http://localhost:5173/client/main.tsx"></script>
  </body>
</html>`,
  }),
);

app.get("/", async (_req, res) => {
  await res.inertia("Home", {
    message: "Hello from Express + Inertia + React",
  });
});

app.get("/users", async (req, res) => {
  await res.inertia("Users/Index", {
    users: [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ],
  });
});

app.listen(3000, () => console.log("http://localhost:3000"));
```

## Client entry

```tsx
// client/main.tsx
import { createInertiaApp } from "@inertiajs/react";
import { createRoot } from "react-dom/client";

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob("../pages/**/*.tsx", { eager: true });
    return pages[`../pages/${name}.tsx`] as object;
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },
});
```

## Vite config

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

## Home page component

```tsx
// pages/Home.tsx
interface Props {
  message: string;
  auth: { user: { name: string } };
}

export default function Home({ message, auth }: Props) {
  return (
    <div>
      <h1>{message}</h1>
      <p>Logged in as: {auth.user.name}</p>
    </div>
  );
}
```

## Running

```bash
# Terminal 1
npx tsx watch server/index.ts

# Terminal 2
npx vite
```

## Form handling

```tsx
// pages/Users/New.tsx
import { useForm } from "@inertiajs/react";

export default function NewUser() {
  const form = useForm({ name: "", email: "" });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.post("/users");
      }}
    >
      <input
        type="text"
        value={form.data.name}
        onChange={(e) => form.setData("name", e.target.value)}
      />
      {form.errors.name && <p>{form.errors.name}</p>}
      <button type="submit">Create</button>
    </form>
  );
}
```

```ts
// server route
app.post("/users", (req, res) => {
  const errors = validate(req.body);
  if (Object.keys(errors).length) {
    res.inertiaErrors(errors);
    return res.redirect("/users/new");
  }
  // create user...
  res.redirect("/users");
});
```
