import type { PageProps } from './types.js';

/**
 * Flat map of `field → first error message`, the shape the Inertia client
 * expects under `props.errors`.
 */
export type ValidationErrors = Record<string, string>;

/**
 * Apply error-bag scoping to a flat errors object, matching the official
 * Inertia behavior. When `bag` is set, errors are namespaced under
 * `props.errors[bag]`. When `bag` is null, errors live at `props.errors`.
 *
 * @param errors Flat field-to-message map.
 * @param bag Optional error-bag name (e.g. `"createUser"`); null for top-level.
 */
export function scopeErrors(errors: ValidationErrors, bag: string | null): PageProps {
  if (bag) {
    return { errors: { [bag]: errors } };
  }

  return { errors };
}

/**
 * Named validation error bags, keyed by bag name. The `default` key is the
 * unnamed bag that Laravel-style validation writes to when no bag is given.
 */
export type ValidationErrorBags = Record<string, ValidationErrors>;

/**
 * Resolve the `errors` prop from validation error bags at read time. Port of
 * inertia-laravel `Middleware::resolveValidationErrors` (3.x).
 *
 * - No bags, or an empty map: `{}`.
 * - A `default` bag and an `errorBag` sent by the client: scoped to that name,
 *   `{ [errorBag]: bags.default }`.
 * - A `default` bag with no `errorBag`: the default bag flat, `bags.default`.
 * - No `default` bag: the bags map as-is, each key already a bag name.
 *
 * @param bags Error bags keyed by name, or null/undefined when none exist.
 * @param errorBag Bag name from the `X-Inertia-Error-Bag` request header, or null.
 */
export function resolveValidationErrors(
  bags: ValidationErrorBags | undefined | null,
  errorBag: string | null,
): PageProps {
  if (!bags || Object.keys(bags).length === 0) {
    return {};
  }

  const defaultBag = bags.default;

  if (defaultBag !== undefined) {
    if (errorBag) {
      return { [errorBag]: defaultBag };
    }

    return defaultBag;
  }

  return bags;
}
