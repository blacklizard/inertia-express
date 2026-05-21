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
