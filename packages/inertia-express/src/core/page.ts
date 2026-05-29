import type { InertiaPage, PageProps } from './types.js';

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
 * Inputs to {@link createPage} — the fields of an {@link InertiaPage} plus
 * optional history flags and v3 prop-key metadata.
 */
export interface CreatePageInput<TProps extends PageProps = PageProps> {
  component: string;
  props: TProps;
  url: string;
  version: string | null;
  clearHistory?: boolean;
  encryptHistory?: boolean;
  deferredProps?: Record<string, string[]>;
  mergeProps?: string[];
  deepMergeProps?: string[];
  matchPropsOn?: string[];
  flash?: unknown;
}

/**
 * Build a normalized Inertia v3 page object. `clearHistory` and `encryptHistory`
 * default to `false`. Empty/absent `deferredProps` / `mergeProps` /
 * `deepMergeProps` / `matchPropsOn` are dropped so the JSON over the wire stays
 * compact. `flash` is emitted as a top-level key only when it carries data
 * (non-nullish, and a non-empty object when object-valued) — mirroring
 * inertia-laravel's `$flash ? ['flash' => $flash] : []`.
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
  };

  if (input.deferredProps && Object.keys(input.deferredProps).length > 0) {
    page.deferredProps = input.deferredProps;
  }

  if (input.mergeProps && input.mergeProps.length > 0) {
    page.mergeProps = input.mergeProps;
  }

  if (input.deepMergeProps && input.deepMergeProps.length > 0) {
    page.deepMergeProps = input.deepMergeProps;
  }

  if (input.matchPropsOn && input.matchPropsOn.length > 0) {
    page.matchPropsOn = input.matchPropsOn;
  }

  if (hasFlashData(input.flash)) {
    page.flash = input.flash;
  }

  return page;
}
