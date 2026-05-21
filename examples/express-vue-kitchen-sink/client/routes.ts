// Hand-written static route helpers replacing the Laravel Wayfinder codegen.
// Each helper returns a `{ url, method }` object — the same shape Wayfinder
// emits and `@inertiajs/vue3` <Link> / `toUrl` accept. Only the CRM routes the
// ported pages actually use are covered here.

type RouteMethod = "get" | "post" | "put" | "patch" | "delete";

/** A route reference: a URL plus the HTTP method to reach it. */
export type RouteRef = { url: string; method: RouteMethod };

/** Builds a route reference. */
function route(url: string, method: RouteMethod = "get"): RouteRef {
  return { url, method };
}

/**
 * A Wayfinder-style callable route helper. Calling it returns a
 * `{ url, method }` ref; it also carries `.url()`, `.get()` and `.form()`
 * accessors so copied demo pages that use any of those forms work unchanged.
 */
export type WayfinderHelper = (() => RouteRef) & {
  url: () => string;
  get: () => RouteRef;
  form: () => { action: string; method: RouteMethod };
};

/** Wraps a fixed URL + method into a Wayfinder-style callable helper. */
export function helper(
  url: string,
  method: RouteMethod = "get",
): WayfinderHelper {
  const fn = (() => route(url, method)) as WayfinderHelper;
  fn.url = () => url;
  fn.get = () => route(url, method);
  fn.form = () => ({ action: url, method });
  return fn;
}

/** App home — redirects to the dashboard (or login for guests). */
export function home(): RouteRef {
  return route("/");
}

/** CRM dashboard. */
export function dashboard(): RouteRef {
  return route("/dashboard");
}

/** Login page + form-submit action. */
export const login = {
  url: () => "/login",
  get: () => route("/login"),
  store: helper("/login", "post"),
};

/** Logout action — clears the session server-side. */
export function logout(): RouteRef {
  return route("/logout", "post");
}

/** Contact resource routes. */
export const contacts = {
  index: () => route("/contacts"),
  create: () => route("/contacts/create"),
  store: () => route("/contacts", "post"),
  show: (id: number | string) => route(`/contacts/${id}`),
  edit: (id: number | string) => route(`/contacts/${id}/edit`),
  update: (id: number | string) => route(`/contacts/${id}`, "put"),
  destroy: (id: number | string) => route(`/contacts/${id}`, "delete"),
  favorite: (id: number | string) => route(`/contacts/${id}/favorite`, "post"),
  notes: {
    store: (contactId: number | string) =>
      route(`/contacts/${contactId}/notes`, "post"),
  },
};

/** Organization resource routes. */
export const organizations = {
  index: () => route("/organizations"),
  show: (id: number | string) => route(`/organizations/${id}`),
  update: (id: number | string) => route(`/organizations/${id}`, "put"),
};
