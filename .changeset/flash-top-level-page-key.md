---
"@blacklizard/inertia-express": major
---

Surface session flash data as a top-level `flash` page key instead of a prop

`flashFromSession` previously merged `req.session.flash` into the page **props**
as `props.flash`. This diverged from the Inertia protocol: inertia-laravel's
`Response::resolveFlashData` exposes flash as a **top-level** page key (a sibling
of `props`, `url`, and `version`), and the official client reads it via
`usePage().flash`. Flash is now emitted there, and the key is omitted entirely
when there is no flash (matching Laravel's `$flash ? ['flash' => $flash] : []`).

Validation errors are unchanged — they remain the `errors` shared prop.

**Migration:** read flash from `usePage().flash` instead of `usePage().props.flash`
on the client. A page prop you happen to name `flash` (e.g. via `sharedProps` or
`always()`) is untouched and still lives under `props` — it no longer collides
with session flash.
