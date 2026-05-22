# Express + Vue + Inertia — Kitchen Sink

Port of the official [Inertia.js v3 demo app](https://demo.inertiajs.com) to
`@blacklizard/inertia-express`. Full CRM plus a feature-showcase covering every
Inertia v3 capability. Single-process dev with in-process SSR — no Docker.

```bash
pnpm install
pnpm dev
# → http://localhost:3100
```

Login with **test@example.com** and any non-empty password.

## How SSR works here

`server/index.ts` embeds a Vite dev server in middleware mode. Assets and HMR
go through `vite.middlewares`; the SSR entry (`client/ssr.ts`) is loaded with
`vite.ssrLoadModule` and its `render(page)` is passed as the adapter's `ssr`
option. First paint is server-rendered; navigation is SPA.

## CRM

| Route | Description |
|---|---|
| `/dashboard` | Stats (deferred), recent notes |
| `/contacts` | Cursor-paginated list, search, favorites, load-more |
| `/contacts/:id` | Show, add notes (deferred), toggle favorite |
| `/contacts/create` | Create with validation |
| `/contacts/:id/edit` | Edit with validation |
| `/organizations` | Offset-paginated list, search |
| `/organizations/:id` | Show members, inline name edit |

All data is in-memory. Changes survive the process lifetime; restart to reset.

## Feature Showcase

### Forms
| Route | Demonstrates |
|---|---|
| `/features/forms/use-form` | `useForm` — dirty tracking, reset, submit |
| `/features/forms/form-component` | `<Form>` component |
| `/features/forms/file-uploads` | `useForm` with `File`, progress bar, multer on server |
| `/features/forms/validation` | Server errors, error bags, `setError`/`clearErrors` |
| `/features/forms/optimistic-updates` | Optimistic toggle with simulated rollback |
| `/features/forms/use-form-context` | `useFormContext` shared across child components |
| `/features/forms/dotted-keys` | Nested keys via dot notation |

### Navigation
| Route | Demonstrates |
|---|---|
| `/features/navigation/links` | `<Link>` variants, methods, headers |
| `/features/navigation/preserve-state` | `preserveState` |
| `/features/navigation/preserve-scroll` | `preserveScroll` |
| `/features/navigation/view-transitions` | View Transitions API |
| `/features/navigation/history-management` | `clearHistory` / `encryptHistory` |
| `/features/navigation/async-requests` | Async visits, slow-route demo |
| `/features/navigation/manual-visits` | `router.visit()` options |
| `/features/navigation/redirects` | `redirect()->back()`, `to_route()`, external |
| `/features/navigation/scroll-management` | Scroll regions |
| `/features/navigation/instant-visits` | `prefetch` + instant navigation |
| `/features/navigation/url-fragments` | Hash fragments, `preserveFragment` |

### Data Loading
| Route | Demonstrates |
|---|---|
| `/features/data-loading/deferred-props` | `defer()`, named groups, reloading, rescue |
| `/features/data-loading/partial-reloads` | `only`, `except`, partial reload triggers |
| `/features/data-loading/when-visible` | `<WhenVisible>` — load on scroll into viewport |
| `/features/data-loading/polling` | `usePoll` |
| `/features/data-loading/prop-merging` | `merge()`, `deepMerge()`, reset |
| `/features/data-loading/once-props` | Props frozen after first load |
| `/features/data-loading/optional-props` | `optional()` — omit until named |

### Prefetching
| Route | Demonstrates |
|---|---|
| `/features/prefetching/link-prefetch` | `prefetch="hover"` / `"mount"` on `<Link>` |
| `/features/prefetching/stale-while-revalidate` | SWR cache strategy |
| `/features/prefetching/manual-prefetch` | `router.prefetch()` |
| `/features/prefetching/cache-management` | Cache TTL, flush |

### State
| Route | Demonstrates |
|---|---|
| `/features/state/remember` | `useRemember` across navigations |
| `/features/state/flash-data` | Server flash, client flash, callback flash, event listener |
| `/features/state/shared-props` | `sharedProps`, `usePage()` |

### Layouts & Head
| Route | Demonstrates |
|---|---|
| `/features/layouts/persistent-layouts` | Persistent layout across navigations |
| `/features/layouts/nested-layouts` | Layout composition |
| `/features/layouts/head` | `<Head>` — per-page `<title>` and meta |
| `/features/layouts/layout-props` | Passing props to a layout |

### Events & Lifecycle
| Route | Demonstrates |
|---|---|
| `/features/events/global-events` | `router.on(event, cb)` |
| `/features/events/visit-callbacks` | `onBefore`, `onSuccess`, `onError`, etc. |
| `/features/events/progress` | Progress bar, slow-route demo |

### Error Handling
| Route | Demonstrates |
|---|---|
| `/features/errors/http-exceptions` | 403/404/500 and unhandled status codes |
| `/features/errors/network-errors` | Network failure handling |

### HTTP
| Route | Demonstrates |
|---|---|
| `/features/http/use-http` | `useHttp` composable — raw `fetch` via Inertia |

## What's not ported

| Page | Reason |
|---|---|
| Precognition | Requires `laravel-precognition-vue` — Laravel-specific |
| Wayfinder | Codegen from Laravel artisan — replaced with static shims |
| Infinite Scroll | Requires `Inertia::scroll()` server protocol extension — Laravel-only |

## Server layout

```
server/
  index.ts          Express app, CRM routes, auth, session
  data.ts           In-memory seed data (100 contacts, 15 orgs, users, notes)
  serializers.ts    Plain-object JSON shapes for each model
  routes/
    features.ts     All feature-showcase GET + POST handlers
```

## Client layout

```
client/
  pages/
    Auth/           Login
    Crm/            Dashboard
    Contacts/       Index, Show, Create, Edit
    Organizations/  Index, Show
    Features/       One subdirectory per category
  layouts/          AppLayout, AuthLayout, PersistentDemoLayout
  components/       Shared UI + shadcn-vue primitives
  wayfinder/        Static route-helper shims (replaces Laravel Wayfinder codegen)
  routes.ts         Hand-written Wayfinder-style route helpers
```
