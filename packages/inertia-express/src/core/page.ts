import type { InertiaPage, PageProps, PropsMetadata } from './types.js';

/**
 * Whether flash data is worth emitting as a top-level page key. Nullish and
 * empty-object flash are dropped so the wire payload stays compact and
 * absent flash never surfaces a stray `flash: {}` to the client.
 *
 * @param flash Candidate flash value pulled from the session.
 */
function hasFlashData(flash: unknown): boolean {
  if (flash === null || flash === undefined) {
    return false;
  }

  if (typeof flash === 'object' && !Array.isArray(flash)) {
    return Object.keys(flash).length > 0;
  }

  return true;
}

/**
 * Every {@link PropsMetadata} key, in protocol order. `createPage` copies only
 * these keys, so a widened metadata object cannot overwrite page fields.
 */
const METADATA_KEYS = [
  'sharedProps',
  'mergeProps',
  'prependProps',
  'deepMergeProps',
  'matchPropsOn',
  'deferredProps',
  'rescuedProps',
  'scrollProps',
  'onceProps',
] as const satisfies readonly (keyof PropsMetadata)[];

/**
 * Whether a metadata value carries anything worth emitting: a non-empty array
 * or an object with at least one key.
 *
 * @param value Candidate metadata value from {@link PropsMetadata}.
 */
function hasMetadataEntries(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value !== null && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return false;
}

/**
 * Inputs to {@link createPage} — the fields of an {@link InertiaPage} plus
 * optional history flags and the v3 prop metadata produced by the resolver.
 */
export interface CreatePageInput<TProps extends PageProps = PageProps> {
  component: string;
  props: TProps;
  url: string;
  version: string | null;
  clearHistory?: boolean;
  encryptHistory?: boolean;
  preserveFragment?: boolean;
  metadata?: PropsMetadata;
  flash?: unknown;
}

/**
 * Build a normalized Inertia v3 page object. `clearHistory`, `encryptHistory`
 * and `preserveFragment` default to `false` and are always present. Each
 * `metadata` key is copied onto the page only when non-empty so the JSON over
 * the wire stays compact. `flash` is emitted as a top-level key only when it
 * carries data (non-nullish, and a non-empty object when object-valued) —
 * mirroring inertia-laravel's `$flash ? ['flash' => $flash] : []`.
 *
 * @param input Required page fields plus the optional v3 extras.
 */
export function createPage<TProps extends PageProps>(input: CreatePageInput<TProps>): InertiaPage<TProps> {
  const page: InertiaPage<TProps> = {
    component: input.component,
    props: input.props,
    url: input.url,
    version: input.version,
    clearHistory: input.clearHistory ?? false,
    encryptHistory: input.encryptHistory ?? false,
    preserveFragment: input.preserveFragment ?? false,
  };

  const { metadata } = input;

  if (metadata) {
    METADATA_KEYS.forEach((key) => {
      if (hasMetadataEntries(metadata[key])) {
        Object.assign(page, { [key]: metadata[key] });
      }
    });
  }

  if (hasFlashData(input.flash)) {
    page.flash = input.flash;
  }

  return page;
}
