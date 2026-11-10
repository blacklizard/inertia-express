import PropsResolver from './props-resolver.js';

import type { InertiaRequestInfo, PageProps, RescueHandler } from './types.js';

/**
 * Request info for a broadcast: not an Inertia request, nothing partial, nothing already loaded.
 */
const EMPTY_REQUEST: InertiaRequestInfo = Object.freeze({
  isInertia: false,
  version: null,
  partialComponent: null,
  partialOnly: null,
  partialExcept: null,
  errorBag: null,
  resetKeys: null,
  exceptOnceProps: [],
  mergeIntent: 'append',
  isPrefetch: false,
  socketId: null,
  method: 'GET',
  url: '/',
});

/**
 * Resolve props for a socket broadcast payload. Every prop is resolved (no
 * partial filtering, no once/defer exclusion) and rescued props are omitted.
 *
 * @param props Props to resolve.
 * @param onRescue Hook called when a rescued prop throws.
 */
export async function resolveBroadcastProps(props: PageProps, onRescue?: RescueHandler): Promise<PageProps> {
  return new PropsResolver({ ...EMPTY_REQUEST, exceptOnceProps: [] }, '', onRescue).resolveBroadcast(props);
}

/**
 * Build the `{ __inertia: { props } }` envelope a socket server broadcasts.
 *
 * @param props Props to resolve.
 * @param onRescue Hook called when a rescued prop throws.
 */
export async function broadcastProps(
  props: PageProps,
  onRescue?: RescueHandler,
): Promise<{ __inertia: { props: PageProps } }> {
  return { __inertia: { props: await resolveBroadcastProps(props, onRescue) } };
}
