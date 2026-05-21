/**
 * Status code Inertia uses for "soft" redirects after PUT/PATCH/DELETE so the
 * follow-up GET is forced to also be a GET on every browser.
 */
export const INERTIA_REDIRECT_STATUS = 303;

/**
 * Status code used for the `X-Inertia-Location` external redirect
 * mechanism. The client intercepts the 409 and performs a window.location
 * navigation rather than a fetch.
 */
export const INERTIA_LOCATION_STATUS = 409;

/**
 * Decide which status code to use for a redirect produced by an Inertia
 * request. After a non-GET/HEAD form submission the response must be 303
 * so the client's follow-up request becomes a GET.
 *
 * @param method HTTP method of the inbound request (case-insensitive).
 * @param fallback Status code to use for GET/HEAD/POST. Defaults to 302.
 */
export function inertiaRedirectStatus(method: string, fallback = 302): number {
  const m = method.toUpperCase();

  if (m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
    return INERTIA_REDIRECT_STATUS;
  }

  return fallback;
}
