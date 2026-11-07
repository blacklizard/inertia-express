# Redirects & Errors

## Standard redirects

For Inertia requests, a `302` from `res.redirect()` after a `PUT`, `PATCH`, `DELETE` or `QUERY` is automatically promoted to `303`. This is required by the Inertia protocol — `303` ensures the follow-up request is always a `GET`, regardless of the browser.

```ts
app.post("/users", async (req, res) => {
  const user = await db.users.create(req.body);
  res.redirect(`/users/${user.id}`); // 302 for GET/POST, 303 for PUT/PATCH/DELETE/QUERY
});
```

You don't need to do anything special — the middleware wraps `res.redirect` automatically for Inertia requests.

### Redirects with URL fragments

Browsers drop the `#fragment` when they follow a redirect for an XHR request, so a plain redirect to `/article#section` would land the client on `/article`. On an Inertia request, a `res.redirect()` whose target contains `#` is answered with `409`, an `X-Inertia-Redirect: <url>` header and an empty body instead; the Inertia client then visits that URL itself and keeps the fragment. This is a port of inertia-laravel's `Middleware::onRedirectWithFragment`.

```ts
app.post("/comments", async (req, res) => {
  const comment = await db.comments.create(req.body);
  res.redirect(`/article#comment-${comment.id}`);
  // Inertia request → 409, X-Inertia-Redirect: /article#comment-42
});
```

- The header value is encoded the same way Express encodes `Location`, so non-ASCII paths are percent-encoded (`/日本#x` → `/%E6%97%A5%E6%9C%AC#x`).
- An encoded `%23` is not a fragment: `/search?q=a%23b` redirects normally.
- Plain browser requests and prefetch requests (`Purpose`, `Sec-Purpose` or `X-Moz` set to `prefetch`) get the normal redirect.

### Empty responses

If a handler ends an Inertia request with a `200` and an empty body (`res.end()`, `res.send("")`), the middleware turns the response into a redirect back: to the `Referer` header, or `/` when there is none. The redirect goes through the patched `res.redirect`, so it is a `303` after `PUT`, `PATCH`, `DELETE` or `QUERY` and a `302` otherwise. This is a port of inertia-laravel's `Middleware::onEmptyResponse`.

```ts
app.put("/settings", async (req, res) => {
  await saveSettings(req.body);
  res.end(); // Inertia request → 303 back to the Referer
});
```

A non-empty body (even `"0"`), a body written with `res.write()`, a non-200 status such as `204`, and plain browser requests are left alone. The guard only sees responses that end through `res.end()` with their headers still unsent: it is not applied when headers were already sent (`res.flushHeaders()`, streaming) or when the handler never responds.

## External redirects — `res.inertiaLocation(url)`

Use `res.inertiaLocation()` when redirecting to a different host, or when you need a full page reload rather than an Inertia navigation.

```ts
res.inertiaLocation("https://billing.example.com/checkout");
```

Behavior:
- **Inertia (XHR) request** — responds with `409 + X-Inertia-Location: <url>`. The Inertia client handles this by setting `window.location = url`.
- **Plain browser request** — responds with a standard `302 Location: <url>`.

This is the correct approach when you want to navigate outside of the Inertia SPA context.

## Validation errors — `res.inertiaErrors(errors, bag?)`

Helper to stash validation errors for the next request. Works in the redirect-after-POST pattern:

```ts
app.post("/users", (req, res) => {
  const errors = validate(req.body);

  if (Object.keys(errors).length) {
    res.inertiaErrors(errors);
    return res.redirect("/users/new");
  }

  // success path...
});
```

### How it stores errors

Errors are stored per bag. The bag defaults to `default`; calling `res.inertiaErrors()` again for the same bag replaces that bag, and other bags are kept.

- **With a session** (`req.session` exists) — writes `req.session.inertia.errors[bag] = errors`. The next request reads them and clears them (read-once).
- **Without a session** — writes the same bags map to `res.locals.inertiaErrors` (`{ [bag]: errors }`) for the current response cycle.

```ts
res.inertiaErrors({ name: "required" });
// req.session.inertia.errors → { default: { name: "required" } }
```

### Error bags

Pass a bag name as the second argument to store errors under that bag:

```ts
res.inertiaErrors({ name: "required" }, "createUser");
// req.session.inertia.errors → { createUser: { name: "required" } }
// next page: props.errors → { createUser: { name: "required" } }
```

Bags are remapped when they are read, not when they are written, following inertia-laravel's `Middleware::resolveValidationErrors`:

| Stored bags | `X-Inertia-Error-Bag` header | `props.errors` |
|-------------|------------------------------|----------------|
| none | any | `{}` |
| `default` | absent | `bags.default` (flat) |
| `default` | `signup` | `{ signup: bags.default }` |
| named bags only | any | every bag, keyed by name |

The Inertia client sends `X-Inertia-Error-Bag` when a visit sets the `errorBag` option, so a page with several forms can call `res.inertiaErrors(errors)` without a bag and still read `errors.signup` for the form that asked for it. See [Error bags remap at read time](/guide/caveats#error-bags-remap-at-read-time).

### `errors` is shared automatically

Every page carries an `errors` prop, `{}` when there are none, and `errors` is always listed in the page's `sharedProps`. It is wrapped in `always()`, so it survives partial reloads. No `sharedProps` wiring and no `flashFromSession` are needed. Read it on the client:

```ts
const errors = usePage().props.errors; // { name: "required" }
```

An explicit `errors` key in `sharedProps` or in the page props still wins over the shared one.

## Flash messages

Flash data is one-shot state — set it before a redirect, read it once on the next request. The middleware exposes two ways to set it; both store into `req.session.flash` and both surface as the **top-level `flash` page key** (a sibling of `props`, read on the client via `usePage().flash`) when [`flashFromSession`](/core/middleware#flashfromsession) is on. This mirrors inertia-laravel — flash is never a prop.

### `res.inertiaFlash(data)`

Stash an arbitrary object. Replaces whatever flash was already queued for this redirect.

```ts
app.post("/profile", async (req, res) => {
  await saveProfile(req.body);
  res.inertiaFlash({ success: "Profile updated" });
  res.redirect(303, "/profile");
});
```

```ts
inertia({ flashFromSession: true });
// → next GET renders with page.flash === { success: "Profile updated" }
//    (top-level, read on the client via usePage().flash)
```

### `req.flash(type?, msg?)` — `connect-flash` compatible

`req.flash()` matches [`connect-flash`](https://www.npmjs.com/package/connect-flash) exactly, so existing flash code keeps working unchanged. Messages accumulate into per-type buckets.

```ts
req.flash("info", "Welcome back");          // append → returns new count
req.flash("error", ["bad", "worse"]);       // append an array → returns count
req.flash("info", "Hello %s", user.name);   // util.format interpolation
req.flash("info");                          // read + clear one bucket → string[]
req.flash();                                // read + clear all → Record<string, string[]>
```

Requires a session — calling it without session middleware throws `req.flash() requires sessions`, identical to `connect-flash`.

### Migrating from `connect-flash`

::: danger Remove `connect-flash` first
`connect-flash` **must** be uninstalled. Both packages attach `req.flash` and both write `req.session.flash` — running them together double-processes the bucket and races this package's read-once clear. Uninstall the dependency and delete the `app.use(flash())` line.
:::

This package is a one-to-one drop-in replacement:

| `connect-flash` | inertia-express | Notes |
|-----------------|-----------------|-------|
| `npm i connect-flash` | *(remove it)* | `req.flash` is built into the `inertia()` middleware |
| `app.use(require("connect-flash")())` | *(delete this line)* | Mounting `inertia()` is enough |
| `req.flash("info", "msg")` | `req.flash("info", "msg")` | Identical — append, returns count |
| `req.flash("info", ["a", "b"])` | `req.flash("info", ["a", "b"])` | Identical — append array |
| `req.flash("info", "Hi %s", name)` | `req.flash("info", "Hi %s", name)` | Identical — `util.format` |
| `req.flash("info")` | `req.flash("info")` | Identical — read + clear bucket |
| `req.flash()` | `req.flash()` | Identical — read + clear all |
| `res.render(view, { messages: req.flash() })` | `inertia({ flashFromSession: true })` | The top-level `flash` page key is populated automatically — drop the manual getter |

Migration steps:

1. `pnpm remove connect-flash` (and `@types/connect-flash`).
2. Delete `app.use(flash())` — the `inertia()` middleware already provides `req.flash`.
3. Keep every `req.flash("type", "msg")` **setter** call as-is.
4. Replace manual `req.flash()` **getter** reads in your render path with `flashFromSession: true`; the top-level `flash` page key carries the buckets (read it client-side with `usePage().flash`).

## `scopeErrors(errors, bag)`

Low-level helper that wraps errors in the bag namespace. The middleware no longer uses it (bags are stored as-is and remapped at read time, see [Error bags](#error-bags)); it is still exported:

```ts
import { scopeErrors } from "@blacklizard/inertia-express/core";

const scoped = scopeErrors({ name: "required" }, "createUser");
// { errors: { createUser: { name: "required" } } }

const unscoped = scopeErrors({ name: "required" }, null);
// { errors: { name: "required" } }
```
