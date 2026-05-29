import { createPage } from './page.js';
import { resolveProps } from './props.js';

import type {
  InertiaPage, InertiaRequestInfo, PageProps, RenderOptions, SharedPropsInput,
} from './types.js';

/**
 * Inputs to {@link buildPage}. `TReq` is the framework's request type so
 * `shared` (when a function) receives the correct argument shape.
 */
export interface BuildPageInput<TReq = unknown> {
  component: string;
  props: PageProps;
  request: InertiaRequestInfo;
  req: TReq;
  shared: SharedPropsInput<TReq> | undefined;
  version: string | null;
  options?: RenderOptions;
  /**
   * Read-once flash data to emit as a top-level page key. Resolved by the
   * caller (e.g. from the session); omitted from the page when nullish/empty.
   */
  flash?: unknown;
}

/**
 * Resolve a `SharedPropsInput` to a plain props object. Returns `{}` for
 * undefined/null inputs or when the resolver returns nullish.
 *
 * @param shared Static props object, a (possibly async) function, or undefined.
 * @param req Request passed to the resolver when `shared` is a function.
 */
async function evaluateShared<TReq>(shared: SharedPropsInput<TReq> | undefined, req: TReq): Promise<PageProps> {
  if (shared === undefined || shared === null) {
    return {};
  }

  if (typeof shared === 'function') {
    const result = await shared(req);

    return result ?? {};
  }

  return shared;
}

/**
 * Build the final {@link InertiaPage} object given a controller's component
 * + props, the request info, and configured shared props / version.
 *
 * Returned page is suitable for either:
 *   - JSON serialization on `X-Inertia` requests, or
 *   - embedding into the root HTML view via a `<script>` page tag.
 *
 * @param input Component, props, parsed request, shared resolver, version, and
 *   optional `clearHistory` / `encryptHistory` flags.
 */
export async function buildPage<TReq>(input: BuildPageInput<TReq>): Promise<InertiaPage> {
  const sharedProps = await evaluateShared(input.shared, input.req);

  const resolved = await resolveProps({
    props: input.props,
    shared: sharedProps,
    component: input.component,
    request: input.request,
  });

  return createPage({
    component: input.component,
    props: resolved.props,
    url: input.request.url,
    version: input.version,
    clearHistory: input.options?.clearHistory,
    encryptHistory: input.options?.encryptHistory,
    deferredProps: resolved.deferred,
    mergeProps: resolved.merge,
    deepMergeProps: resolved.deepMerge,
    matchPropsOn: resolved.matchOn,
    flash: input.flash,
  });
}
