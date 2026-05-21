import { randomUUID } from "node:crypto";
import { always, defer, deepMerge, inertia, lazy, merge, optional } from "@blacklizard/inertia-express";
import express from "express";
import session from "express-session";
import { createServer as createViteServer } from "vite";

declare module "express-session" {
  interface SessionData {
    errors?: Record<string, unknown>;
    flash?: { success?: string };
  }
}

const PORT = Number(process.env.PORT ?? 3000);

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});

const app = express();
// Vite serves /@vite/client, /client/*, HMR — and calls next() for page routes.
app.use(vite.middlewares);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: "showcase-dev-secret",
    resave: false,
    saveUninitialized: false,
  }),
);

// In-process SSR: load the SSR entry through Vite so .vue files are compiled.
const ssrRender = async ({ page }: { page: unknown }) => {
  const mod = (await vite.ssrLoadModule("/client/ssr.ts")) as {
    render: (p: unknown) => Promise<{ head: string[]; body: string }>;
  };
  const { head, body } = await mod.render(page);
  // @inertiajs/vue3's SSR body is the full root element including data-page.
  return { head, body, bodyIsFullRoot: true };
};

app.use(
  inertia({
    version: "showcase-v1",
    sharedProps: { auth: { user: { name: "Demo User" } } },
    // Auto-expose session errors + flash as the `errors` / `flash` props
    // (read-once). Replaces hand-rolled flash plumbing in sharedProps.
    flashFromSession: true,
    ssr: ssrRender,
    rootView: ({ res }) => {
      const ssr = (res.locals.ssr ?? { head: [], body: "" }) as {
        head: string | string[];
        body: string;
        bodyIsFullRoot?: boolean;
      };
      const head = Array.isArray(ssr.head) ? ssr.head.join("") : (ssr.head ?? "");
      const root = ssr.body || '<div id="app"></div>';
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inertia v3 Showcase</title>
    ${head}
  </head>
  <body>
    ${root}
    <script type="module" src="/@vite/client"></script>
    <script type="module" src="/client/main.ts"></script>
  </body>
</html>`;
    },
  }),
);

app.get("/", async (_req, res) => {
  await res.inertia("Home", {});
});

app.get("/props", async (_req, res) => {
  await res.inertia("Props", {
    // Plain — evaluated now, always sent.
    serverTime: new Date().toISOString(),
    // Lazy — evaluated every visit (full or partial) when included.
    quote: lazy(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]),
    // Optional — omitted unless a partial reload names it.
    heavyStats: optional(async () => {
      await new Promise((r) => setTimeout(r, 150));
      return { rows: 42_000, computedAt: new Date().toISOString() };
    }),
    // Always — included on every response, even partial reloads.
    liveTick: always(() => Date.now()),
  });
});

app.get("/deferred", async (_req, res) => {
  await res.inertia("Deferred", {
    summary: "Loaded immediately on the initial visit.",
    revenue: defer(async () => {
      await new Promise((r) => setTimeout(r, 400));
      return { total: 128_400, currency: "USD" };
    }, "metrics"),
    visitors: defer(async () => {
      await new Promise((r) => setTimeout(r, 400));
      return { unique: 9_312 };
    }, "metrics"),
    activity: defer(async () => {
      await new Promise((r) => setTimeout(r, 700));
      return ["alice signed in", "bob upgraded", "carol invited dave"];
    }, "activity"),
  });
});

app.get("/merge", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = 5;
  const start = (page - 1) * pageSize;
  const items = Array.from({ length: pageSize }, (_, i) => ({
    id: start + i + 1,
    label: `Item #${start + i + 1}`,
  }));
  await res.inertia("Merge", {
    page,
    // Merge — appended to the client-side prop on partial reloads. `matchOn`
    // dedupes by `id`. A reload with `reset: ["items"]` replaces instead.
    items: merge(items, "id"),
    // Deep-merge — recursively merged into the existing prop.
    settings: deepMerge({ display: { density: "comfortable" } }),
  });
});

app.get("/history", async (req, res) => {
  await res.inertia(
    "History",
    { note: "This page can clear or encrypt browser history state." },
    {
      clearHistory: req.query.clear === "1",
      encryptHistory: req.query.encrypt === "1",
    },
  );
});

app.get("/form", async (_req, res) => {
  await res.inertia("Form", {});
});

app.post("/form", (req, res) => {
  const { name, email, message } = req.body as Record<string, string>;
  const errors: Record<string, string> = {};
  if (!name?.trim()) {
    errors.name = "Name is required.";
  }
  if (!email?.includes("@")) {
    errors.email = "A valid email is required.";
  }
  if (!message?.trim()) {
    errors.message = "Message is required.";
  }

  if (Object.keys(errors).length > 0) {
    // Stash validation errors in the session, then redirect back — the GET
    // re-render exposes them as the `errors` shared prop. (Inertia's 303
    // promotion applies to PUT/PATCH/DELETE; a POST redirect stays 302.)
    res.inertiaErrors(errors);
    res.redirect("/form");
    return;
  }

  // Flash a one-shot success message — surfaced as the `flash` prop on the
  // redirected GET via `flashFromSession`, then cleared after one read.
  res.inertiaFlash({
    success: `Thanks, ${name} — message #${randomUUID().slice(0, 8)} received.`,
  });
  res.redirect("/");
});

const QUOTES = [
  "Ship small, ship often.",
  "Make it work, then make it fast.",
  "The network is the bottleneck.",
  "Cache invalidation is hard.",
];

app.listen(PORT, () => {
  console.log(`showcase: http://localhost:${PORT}`);
});
