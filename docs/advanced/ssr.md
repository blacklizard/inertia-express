# Server-Side Rendering (SSR)

SSR pre-renders the initial HTML on the server so the first byte contains the full page markup. This improves Time to First Contentful Paint and enables SEO crawling.

## Basic SSR hook

Pass an `ssr` function to `inertia()`. It receives the resolved page object and must return `{ head, body }` (or `null` to fall back to client-only rendering for that request):

```ts
inertia({
  ssr: async ({ page }) => {
    const { default: render } = await import("./dist/ssr/entry-server.js");
    return render(page);
  },
});
```

The rendered output is available on `res.locals.ssr` for your `rootView`:

```ts
inertia({
  ssr: myRenderer,
  rootView: ({ page, res }) => {
    const ssr = res.locals.ssr ?? { head: "", body: "" };
    const head = Array.isArray(ssr.head) ? ssr.head.join("") : ssr.head;
    return `
      <!doctype html>
      <html>
        <head>${head}</head>
        <body>
          <div id="app">${ssr.body}</div>
          <script data-page="app" type="application/json">${JSON.stringify(page).replace(/</g, "\\u003C")}</script>
          <script type="module" src="/build/app.js"></script>
        </body>
      </html>
    `;
  },
});
```

## `SsrResult` shape

```ts
interface SsrResult {
  body: string;                    // Inner HTML of the root element (recommended)
  head?: string | string[];        // <meta>/<title>/<link> tags
  bodyIsFullRoot?: boolean;        // Set true if body includes the full root element + page <script> tag
}
```

Returning `null` from the SSR hook skips SSR for that request — useful when your SSR server is temporarily unavailable.

## Out-of-process SSR — `createInertiaSsrFetcher`

For production, run SSR in a separate process pool and call it over HTTP. This isolates crashes, enables independent scaling, and keeps the web process lean.

```ts
import { inertia, createInertiaSsrFetcher } from "@blacklizard/inertia-express";

app.use(
  inertia({
    ssr: createInertiaSsrFetcher({
      url: process.env.SSR_URL ?? "http://127.0.0.1:13714/render",
      timeoutMs: 5000,
      retries: 2,
      breakerThreshold: 5,
      breakerCooldownMs: 30_000,
      fallback: "client",
    }),
  }),
);
```

### `createInertiaSsrFetcher` options

| Option | Default | Description |
|--------|---------|-------------|
| `url` | — | SSR endpoint URL. POSTs the page object as JSON. |
| `timeoutMs` | `5000` | Per-attempt timeout in ms. |
| `retries` | `2` | Retry attempts on failure (up to 3 total tries). Uses exponential backoff. |
| `retryBaseMs` | `100` | Initial backoff delay. Doubles each retry. |
| `breakerThreshold` | `5` | Open the circuit after N consecutive failures. Set `0` or `Infinity` to disable. |
| `breakerCooldownMs` | `30000` | How long the circuit stays open before allowing one probe request. |
| `fallback` | `"client"` | `"client"` returns null (client renders). `"throw"` rethrows the error. |
| `headers` | — | Extra headers to send on each request. |

### Wire protocol

The wire protocol matches `@inertiajs/{vue3,react,svelte}/server` `createServer()`:

- **Request:** `POST /render` with the page object as JSON body
- **Response:** `{ head: string[], body: string }`

This means you can point `createInertiaSsrFetcher` at the official Inertia SSR server or at `@blacklizard/inertia-ssr-worker`.

## Production SSR worker — `@blacklizard/inertia-ssr-worker`

For a managed SSR process, see [`@blacklizard/inertia-ssr-worker`](/packages/inertia-ssr-worker). It provides:

- HTTP server for `POST /render`, `GET /health`, `GET /ready`
- Auto-recycle on max requests, max lifetime, or RSS limit
- Graceful drain on `SIGTERM`/`SIGINT`

## SSR entry point (Vue 3 example)

```ts
// ssr/index.ts
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { createInertiaApp } from "@inertiajs/vue3";
import { createInertiaSsrWorker } from "@blacklizard/inertia-ssr-worker";

const worker = createInertiaSsrWorker({
  async render(page) {
    let appHtml = "";
    let headTags: string[] = [];

    await createInertiaApp({
      page,
      render: renderToString,
      resolve: (name) => {
        const pages = import.meta.glob("../pages/**/*.vue", { eager: true });
        return pages[`../pages/${name}.vue`] as object;
      },
      setup({ App, props, plugin }) {
        const app = createSSRApp({ render: () => h(App, props) });
        app.use(plugin);
        return app;
      },
    }).then(({ html, head }) => {
      appHtml = html;
      headTags = head;
    });

    return { body: appHtml, head: headTags };
  },
  port: 13714,
  maxRequests: 1000,
  maxRssMb: 512,
});

await worker.ready;
```

## Caching SSR output

Layer the view cache on top of SSR to avoid calling the renderer on every request. See [View Cache](/advanced/caching).
