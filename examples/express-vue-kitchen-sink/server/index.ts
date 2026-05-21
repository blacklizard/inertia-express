import { defer, inertia } from "@blacklizard/inertia-express";
import express from "express";
import session from "express-session";
import { createServer as createViteServer } from "vite";
import {
  contacts,
  createContact,
  createNote,
  deleteContact,
  findContact,
  findOrganization,
  findUser,
  notes,
  notesForContact,
  organizations,
  updateContact,
  users,
} from "./data.js";
import { registerFeatureRoutes } from "./routes/features.js";
import {
  type ContactJson,
  contactJson,
  noteJson,
  organizationJson,
  userJson,
} from "./serializers.js";

declare module "express-session" {
  interface SessionData {
    errors?: Record<string, unknown>;
    flash?: Record<string, unknown>;
    userId?: number;
    propMergingCount?: number;
  }
}

const PORT = Number(process.env.PORT ?? 3100);

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});

const app = express();
app.use(vite.middlewares);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: "kitchen-sink-dev-secret",
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
  return { head, body, bodyIsFullRoot: true };
};

app.use(
  inertia({
    version: "kitchen-sink-v1",
    // `auth.user` resolves from the session — populated by POST /login,
    // cleared by POST /logout. Pages behind `requireAuth` always see a user.
    sharedProps: (req) => {
      const userId = req.session?.userId;
      const user = userId ? findUser(userId) : undefined;
      return {
        name: "Inertia.js Kitchen Sink",
        auth: { user: user ? userJson(user) : null },
        sidebarOpen: true,
      };
    },
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
      const fallbackTitle = head.includes("<title")
        ? ""
        : "<title>Inertia Kitchen Sink</title>";
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${fallbackTitle}
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

/** Wraps a slice of records in the cursor-paginated shape InfiniteScroll reads. */
function cursorPage<T>(
  items: T[],
  baseUrl: string,
  cursor: number,
  pageSize: number,
): {
  data: T[];
  next_cursor: string | null;
  next_page_url: string | null;
  prev_cursor: string | null;
  prev_page_url: string | null;
} {
  const start = cursor * pageSize;
  const slice = items.slice(start, start + pageSize);
  const hasNext = start + pageSize < items.length;
  const hasPrev = cursor > 0;
  return {
    data: slice,
    next_cursor: hasNext ? String(cursor + 1) : null,
    next_page_url: hasNext ? `${baseUrl}?cursor=${cursor + 1}` : null,
    prev_cursor: hasPrev ? String(cursor - 1) : null,
    prev_page_url: hasPrev ? `${baseUrl}?cursor=${cursor - 1}` : null,
  };
}

/** Wraps a slice in the offset-paginated shape with `meta.links`. */
function offsetPage<T>(
  items: T[],
  baseUrl: string,
  page: number,
  pageSize: number,
  extraQuery: Record<string, string> = {},
): { data: T[]; meta: { links: { url: string | null; label: string; active: boolean }[] } } {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;
  const data = items.slice(start, start + pageSize);

  const qs = (p: number) => {
    const params = new URLSearchParams({ ...extraQuery, page: String(p) });
    return `${baseUrl}?${params.toString()}`;
  };

  const links: { url: string | null; label: string; active: boolean }[] = [];
  links.push({
    url: current > 1 ? qs(current - 1) : null,
    label: "&laquo; Previous",
    active: false,
  });
  for (let p = 1; p <= pages; p += 1) {
    links.push({ url: qs(p), label: String(p), active: p === current });
  }
  links.push({
    url: current < pages ? qs(current + 1) : null,
    label: "Next &raquo;",
    active: false,
  });

  return { data, meta: { links } };
}

/**
 * Express middleware that gates a route behind a logged-in session.
 * Redirects guests to `/login`; authenticated requests pass through.
 *
 * @param req Incoming request — its session must carry a `userId`.
 * @param res Response used to issue the redirect.
 * @param next Passes control to the route handler when authenticated.
 */
function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (req.session?.userId && findUser(req.session.userId)) {
    next();
    return;
  }
  res.redirect("/login");
}

// Root redirects to the dashboard for members, to login for guests.
app.get("/", (req, res) => {
  res.redirect(req.session?.userId ? "/dashboard" : "/login");
});

// Login page — already-authenticated users skip straight to the dashboard.
app.get("/login", async (req, res) => {
  if (req.session?.userId) {
    res.redirect("/dashboard");
    return;
  }
  await res.inertia("Auth/Login", {});
});

// Login — verifies the email against the seeded users and starts a session.
app.post("/login", (req, res) => {
  const body = req.body as Record<string, string>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const user = users.find((u) => u.email.toLowerCase() === email);

  // The in-memory seed has no password column — accept any non-empty
  // password for a known email, matching the demo's pre-filled credentials.
  if (!user || !password) {
    res.inertiaErrors({ email: "These credentials do not match our records." });
    res.redirect("/login");
    return;
  }

  req.session.userId = user.id;
  res.redirect("/dashboard");
});

// Logout — clears the session and returns to the login page.
app.post("/logout", (req, res) => {
  req.session.userId = undefined;
  res.redirect("/login");
});

// Every route below requires an authenticated session.
app.use(requireAuth);

// CRM dashboard.
app.get("/dashboard", async (_req, res) => {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const recentActivity = [...notes]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10)
    .map(noteJson);

  await res.inertia("Crm/Dashboard", {
    totalContacts: defer(() => contacts.length),
    totalOrganizations: defer(() => organizations.length),
    recentNotesCount: defer(
      () => notes.filter((n) => Date.parse(n.created_at) >= weekAgo).length,
    ),
    recentActivity,
  });
});

// Contacts — index.
app.get("/contacts", async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const favorite = req.query.favorite === "true" || req.query.favorite === "1";
  const cursor = Math.max(0, Number(req.query.cursor ?? 0));

  let list = [...contacts];
  if (search) {
    const needle = search.toLowerCase();
    list = list.filter(
      (c) =>
        c.first_name.toLowerCase().includes(needle) ||
        c.last_name.toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle),
    );
  }
  if (favorite) {
    list = list.filter((c) => c.is_favorite);
  }
  list.sort(
    (a, b) =>
      a.first_name.localeCompare(b.first_name) ||
      a.last_name.localeCompare(b.last_name) ||
      a.id - b.id,
  );

  await res.inertia("Contacts/Index", {
    contacts: cursorPage<ContactJson>(
      list.map(contactJson),
      "/contacts",
      cursor,
      15,
    ),
    filters: { search, favorite },
  });
});

// Contacts — create form.
app.get("/contacts/create", async (_req, res) => {
  await res.inertia("Contacts/Create", {
    organizations: [...organizations]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => organizationJson(o)),
  });
});

// Contacts — store.
app.post("/contacts", (req, res) => {
  const body = req.body as Record<string, string>;
  const errors: Record<string, string> = {};
  if (!body.first_name?.trim()) {
    errors.first_name = "First name is required.";
  }
  if (!body.last_name?.trim()) {
    errors.last_name = "Last name is required.";
  }
  if (body.email && !body.email.includes("@")) {
    errors.email = "A valid email is required.";
  }
  if (Object.keys(errors).length > 0) {
    res.inertiaErrors(errors);
    res.redirect("/contacts/create");
    return;
  }

  const contact = createContact({
    first_name: body.first_name.trim(),
    last_name: body.last_name.trim(),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    organization_id: body.organization_id ? Number(body.organization_id) : null,
  });
  res.inertiaFlash({ message: "Contact created." });
  res.redirect(`/contacts/${contact.id}`);
});

// Contacts — show.
app.get("/contacts/:id", async (req, res, next) => {
  const contact = findContact(Number(req.params.id));
  if (!contact) {
    next();
    return;
  }
  await res.inertia("Contacts/Show", {
    contact: contactJson(contact),
    notes: defer(() => notesForContact(contact.id).map(noteJson)),
  });
});

// Contacts — edit form.
app.get("/contacts/:id/edit", async (req, res, next) => {
  const contact = findContact(Number(req.params.id));
  if (!contact) {
    next();
    return;
  }
  await res.inertia("Contacts/Edit", {
    contact: contactJson(contact),
    organizations: [...organizations]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => organizationJson(o)),
  });
});

// Contacts — update.
app.put("/contacts/:id", (req, res, next) => {
  const contact = findContact(Number(req.params.id));
  if (!contact) {
    next();
    return;
  }
  const body = req.body as Record<string, string>;
  const errors: Record<string, string> = {};
  if (!body.first_name?.trim()) {
    errors.first_name = "First name is required.";
  }
  if (!body.last_name?.trim()) {
    errors.last_name = "Last name is required.";
  }
  if (body.email && !body.email.includes("@")) {
    errors.email = "A valid email is required.";
  }
  if (Object.keys(errors).length > 0) {
    res.inertiaErrors(errors);
    res.redirect(`/contacts/${contact.id}/edit`);
    return;
  }

  updateContact(contact, {
    first_name: body.first_name.trim(),
    last_name: body.last_name.trim(),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    organization_id: body.organization_id ? Number(body.organization_id) : null,
  });
  res.inertiaFlash({ message: "Contact updated." });
  res.redirect(`/contacts/${contact.id}`);
});

// Contacts — destroy.
app.delete("/contacts/:id", (req, res, next) => {
  const contact = findContact(Number(req.params.id));
  if (!contact) {
    next();
    return;
  }
  deleteContact(contact.id);
  res.inertiaFlash({ message: "Contact deleted." });
  res.redirect("/contacts");
});

// Contacts — toggle favorite.
app.post("/contacts/:id/favorite", (req, res, next) => {
  const contact = findContact(Number(req.params.id));
  if (!contact) {
    next();
    return;
  }
  updateContact(contact, { is_favorite: !contact.is_favorite });
  res.inertiaFlash({
    message: contact.is_favorite
      ? "Added to favorites."
      : "Removed from favorites.",
  });
  res.redirect(req.get("referer") ?? `/contacts/${contact.id}`);
});

// Notes — store (nested under a contact).
app.post("/contacts/:id/notes", (req, res, next) => {
  const contact = findContact(Number(req.params.id));
  if (!contact) {
    next();
    return;
  }
  const body = String((req.body as Record<string, string>).body ?? "").trim();
  if (!body) {
    res.inertiaErrors({ body: "Note body is required." });
    res.redirect(`/contacts/${contact.id}`);
    return;
  }
  createNote({
    contact_id: contact.id,
    user_id: req.session.userId ?? users[0].id,
    body,
  });
  res.inertiaFlash({ message: "Note added." });
  res.redirect(`/contacts/${contact.id}`);
});

// Organizations — index.
app.get("/organizations", async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const page = Math.max(1, Number(req.query.page ?? 1));

  let list = [...organizations];
  if (search) {
    const needle = search.toLowerCase();
    list = list.filter((o) => o.name.toLowerCase().includes(needle));
  }
  list.sort((a, b) => a.name.localeCompare(b.name));

  await res.inertia("Organizations/Index", {
    organizations: offsetPage(
      list.map((o) => organizationJson(o, true)),
      "/organizations",
      page,
      20,
      search ? { search } : {},
    ),
    filters: { search },
  });
});

// Organizations — show.
app.get("/organizations/:id", async (req, res, next) => {
  const org = findOrganization(Number(req.params.id));
  if (!org) {
    next();
    return;
  }
  const cursor = Math.max(0, Number(req.query.cursor ?? 0));
  const members = contacts
    .filter((c) => c.organization_id === org.id)
    .sort(
      (a, b) =>
        a.first_name.localeCompare(b.first_name) ||
        a.last_name.localeCompare(b.last_name) ||
        a.id - b.id,
    )
    .map(contactJson);

  await res.inertia("Organizations/Show", {
    organization: organizationJson(org, true),
    contacts: cursorPage<ContactJson>(
      members,
      `/organizations/${org.id}`,
      cursor,
      15,
    ),
  });
});

// Organizations — update.
app.put("/organizations/:id", (req, res, next) => {
  const org = findOrganization(Number(req.params.id));
  if (!org) {
    next();
    return;
  }
  const name = String((req.body as Record<string, string>).name ?? "").trim();
  if (!name) {
    res.inertiaErrors({ name: "Name is required." });
    res.redirect(`/organizations/${org.id}`);
    return;
  }
  org.name = name;
  res.inertiaFlash({ message: "Organization updated." });
  res.redirect(`/organizations/${org.id}`);
});

// Feature-showcase routes (Forms, Navigation, Data Loading, etc.).
registerFeatureRoutes(app);

app.listen(PORT, () => {
  console.log(`kitchen-sink: http://localhost:${PORT}`);
});
