# Express + Vue + Inertia — Feature Showcase

A guided tour of `@blacklizard/inertia-express`. Multi-page dev SPA with
**in-process SSR** — a single process, no Docker.

```bash
pnpm install
pnpm dev
# → http://localhost:3000
```

## How SSR works here

`server/index.ts` embeds a Vite dev server in **middleware mode**. Assets and
HMR are served through `vite.middlewares`; the SSR entry (`client/ssr.ts`) is
loaded with `vite.ssrLoadModule` and its `render(page)` is passed as the
adapter's `ssr` option. First paint is server-rendered; navigation is SPA.

## Pages

| Route       | Demonstrates                                                        |
| ----------- | ------------------------------------------------------------------- |
| `/`         | Intro + links                                                       |
| `/props`    | Plain prop, `lazy()`, `optional()`, `always()`; partial reloads      |
| `/deferred` | `defer()` props — loaded automatically after mount, grouped         |
| `/merge`    | `merge()` paginated list (load more), `deepMerge()`, `X-Inertia-Reset` |
| `/history`  | `clearHistory` / `encryptHistory` page flags                        |
| `/form`     | `useForm` POST, validation errors, redirect-back, session flash      |

`flash` and `auth` are global shared props; `flash` uses `always()` so it
survives partial reloads.
