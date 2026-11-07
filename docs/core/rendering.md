# Rendering Pages

## `res.inertia(component, props?, options?)`

The primary method for rendering Inertia pages inside any Express route handler.

```ts
app.get("/dashboard", async (req, res) => {
  await res.inertia("Dashboard", {
    stats: await dashboard.getStats(),
  });
});
```

### Arguments

| Argument | Type | Description |
|----------|------|-------------|
| `component` | `string` | Component name matching your frontend resolver (e.g. `"Users/Index"`) |
| `props` | `PageProps` | Props passed to the component |
| `options` | `InertiaResponseOptions` | Optional overrides |

### `InertiaResponseOptions`

```ts
interface InertiaResponseOptions {
  url?: string;           // Override URL in the page object (default: req.originalUrl)
  clearHistory?: boolean; // Tell the client to clear browser history
  encryptHistory?: boolean; // Tell the client to encrypt history state
  preserveFragment?: boolean; // Tell the client to keep the current URL #fragment across this visit
}
```

### Behavior

The middleware automatically detects the request type:

**Inertia (XHR) request** (`X-Inertia: true` header present):
- Builds the page object
- Filters props for partial reloads
- Returns `200 application/json` with the page object

**First-load (browser) request**:
- Builds the page object
- Optionally calls the SSR hook
- Renders `rootView` with the page object embedded
- Returns `200 text/html`

## Shared props

Shared props are merged into every page response. Per-page props win on key collisions.

```ts
inertia({
  sharedProps: async (req) => ({
    auth: { user: req.user ?? null },
    csrf: req.csrfToken?.(),
  }),
  // Session flash → top-level `flash` page key, read-once. `errors` is always shared.
  flashFromSession: true,
});
```

Shared props are evaluated once per request. The result is merged with per-page props before filtering for partial reloads.

## The page object

The page object returned to the client follows the Inertia v3 spec:

```ts
interface InertiaPage {
  component: string;
  props: Record<string, unknown>;
  url: string;
  version: string | null;
  clearHistory: boolean;
  encryptHistory: boolean;
  preserveFragment: boolean;                 // keep the URL #fragment across this visit
  sharedProps?: string[];                    // top-level keys that came from shared props
  mergeProps?: string[];                     // paths the client appends (merge(), scroll())
  prependProps?: string[];                   // paths the client prepends (.prepend())
  deepMergeProps?: string[];                 // paths using deepMerge() behaviour
  matchPropsOn?: string[];                   // dotted prop.field match-on paths
  deferredProps?: Record<string, string[]>; // groups → paths of deferred props
  rescuedProps?: string[];                   // deferred props whose producer threw (.rescue())
  scrollProps?: Record<string, ScrollMetadata & { reset: boolean }>; // scroll() pagination, by path
  onceProps?: Record<string, OnceMetadata>;  // once() props, by once key: { prop, expiresAt }
  flash?: unknown;                           // read-once flash data (top-level, not a prop)
}
```

Metadata keys are omitted when empty. See [Props](/core/props) for the helpers that produce them and [API: Types](/api/types#inertiapage) for `ScrollMetadata` / `OnceMetadata`.
```

## Partial reloads

When the client triggers a partial reload, it sends:

- `X-Inertia-Partial-Component` — the component currently mounted
- `X-Inertia-Partial-Data` — comma-separated prop keys to include
- `X-Inertia-Partial-Except` — comma-separated prop keys to exclude

The middleware applies this filtering automatically. Filtering only applies when `X-Inertia-Partial-Component` matches the rendered component, so cross-page navigations never drop props.

Keys may be dotted paths. `only: users.data` on a plain-object `users` returns just `{ users: { data } }`; children of a closure or descriptor bypass filtering and come back whole. `except: users.data` drops the whole top-level `users`, as in 2.x and in the upstream reference server (inertia-laravel keeps `users` and drops only the child; the adapter deliberately differs from it here).

## `encodePageScript(page)`

Helper to encode the page JSON for the Inertia v3 initial-page transport — a
`<script type="application/json" data-page="...">` tag the client reads on boot:

```ts
import { encodePageScript } from "@blacklizard/inertia-express";

rootView: ({ page }) => `
  <div id="app"></div>
  <script data-page="app" type="application/json">${encodePageScript(page)}</script>
`
```

`encodePageScript` escapes every `<` to its JSON unicode escape, so the payload
cannot terminate the `</script>` element or open an HTML comment.
