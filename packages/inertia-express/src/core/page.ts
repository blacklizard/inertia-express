import type { InertiaPage, PageProps } from './types.js';

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
}

/**
 * Build a normalized Inertia v3 page object. `clearHistory` and `encryptHistory`
 * default to `false`. Empty/absent `deferredProps` / `mergeProps` /
 * `deepMergeProps` / `matchPropsOn` are dropped so the JSON over the wire stays
 * compact.
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

  return page;
}
