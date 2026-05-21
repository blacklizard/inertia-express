# Redirects & Errors

## Standard redirects

For Inertia requests, `res.redirect()` after a `PUT`, `PATCH`, or `DELETE` is automatically promoted to `303`. This is required by the Inertia protocol — `303` ensures the follow-up request is always a `GET`, regardless of the browser.

```ts
app.post("/users", async (req, res) => {
  const user = await db.users.create(req.body);
  res.redirect(`/users/${user.id}`); // 302 for GET, 303 for PUT/PATCH/DELETE
});
```

You don't need to do anything special — the middleware wraps `res.redirect` automatically for Inertia requests.

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

- **With a session** (`req.session` exists) — writes errors to `req.session.errors`. Pick them up via `sharedProps` on the redirected GET.
- **Without a session** — stores them on `res.locals.inertiaErrors` for the same response cycle. Useful when the redirect is within the same middleware stack.

### Error bags

Pass a bag name as the second argument to namespace errors under `errors[bag]`:

```ts
res.inertiaErrors({ name: "required" }, "createUser");
// Results in: { errors: { createUser: { name: "required" } } }
```

Bags are useful when a page has multiple forms.

### Reading errors in sharedProps

The standard pattern:

```ts
inertia({
  sharedProps: (req) => ({
    errors: req.session?.errors ?? {},
    // After reading, clear them so they don't persist across navigations
    // (depends on your session middleware's flash support)
  }),
});
```

Or use `flashFromSession: true` to have the middleware handle clearing automatically.

## Flash messages

Flash data is one-shot state — set it before a redirect, read it once on the next request. The middleware exposes two ways to set it; both store into `req.session.flash` and both surface as the `flash` shared prop when [`flashFromSession`](/core/middleware#flashfromsession) is on.

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
// → next GET renders with props.flash === { success: "Profile updated" }
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
| `res.render(view, { messages: req.flash() })` | `inertia({ flashFromSession: true })` | The `flash` prop is populated automatically — drop the manual getter |

Migration steps:

1. `pnpm remove connect-flash` (and `@types/connect-flash`).
2. Delete `app.use(flash())` — the `inertia()` middleware already provides `req.flash`.
3. Keep every `req.flash("type", "msg")` **setter** call as-is.
4. Replace manual `req.flash()` **getter** reads in your render path with `flashFromSession: true`; the `flash` prop carries the buckets.

## `scopeErrors(errors, bag)`

Low-level helper used internally by `res.inertiaErrors`. Wraps errors in the bag namespace:

```ts
import { scopeErrors } from "@blacklizard/inertia-express/core";

const scoped = scopeErrors({ name: "required" }, "createUser");
// { errors: { createUser: { name: "required" } } }

const unscoped = scopeErrors({ name: "required" }, null);
// { errors: { name: "required" } }
```
