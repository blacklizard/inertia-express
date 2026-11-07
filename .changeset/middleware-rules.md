---
"@blacklizard/inertia-express": minor
---

Port the remaining inertia-laravel `Middleware.php` rules to the Express middleware. On Inertia requests:

- A `302` from `res.redirect()` after a `QUERY` request is promoted to `303`, as it already was after `PUT`, `PATCH` and `DELETE`.
- A redirect whose URL contains a `#` fragment is answered with `409`, an `X-Inertia-Redirect` header (encoded like `Location`) and an empty body, so the client keeps the fragment (`onRedirectWithFragment`). Prefetch requests (`Purpose`, `Sec-Purpose` or `X-Moz` set to `prefetch`) get the normal redirect; `req.inertia.isPrefetch`, `INERTIA_HEADERS.redirect` and `PREFETCH_HEADERS` are new.
- A `200` with an empty body becomes a redirect back to the `Referer`, or `/` without one (`onEmptyResponse`). Responses whose headers were already sent, and handlers that never respond, are not covered.
- The version-mismatch `409` also sends `X-Inertia-Version` with the server's current version (`onVersionChange`).
- Validation errors are shared as the `errors` prop on every page, wrapped in `always()`, and error bags are remapped at read time by the `X-Inertia-Error-Bag` header (`resolveValidationErrors`).

**Breaking for direct readers.** `res.inertiaErrors(errors, bag)` now writes `req.session.inertia.errors[bag]` (bag `default` when omitted), replacing that bag and keeping the others. Without a session, `res.locals.inertiaErrors` is now a bags map (`{ [bag]: errors }`) instead of the scoped `errors` object. `errors` is shared on every page (`{}` when empty, listed in `sharedProps`) whether or not `flashFromSession` is on; `flashFromSession` now gates only the top-level `flash` key. The old `req.session.errors` key is no longer read. Code that read or wrote those keys directly must move to the new locations. `InertiaRequestInfo` gains a required `isPrefetch: boolean`, so code that builds request-info literals by hand must add it.
