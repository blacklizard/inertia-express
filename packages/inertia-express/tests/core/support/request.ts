import type { InertiaRequestInfo } from "../../../src/core/types.js";

/**
 * Build a non-Inertia GET request info with every optional field empty.
 *
 * @param overrides Fields to override on the default request.
 */
export function makeRequest(overrides: Partial<InertiaRequestInfo> = {}): InertiaRequestInfo {
  return {
    isInertia: false,
    version: null,
    partialComponent: null,
    partialOnly: null,
    partialExcept: null,
    errorBag: null,
    resetKeys: null,
    exceptOnceProps: [],
    mergeIntent: "append",
    isPrefetch: false,
    socketId: null,
    method: "GET",
    url: "/",
    ...overrides,
  };
}

/**
 * Build an Inertia partial-reload request for `component`.
 *
 * @param component Component the client says it is reloading.
 * @param opts Partial headers: only/except lists, reset keys, except-once keys, merge intent.
 */
export function partialRequest(
  component: string,
  opts: {
    only?: string[];
    except?: string[];
    reset?: string[];
    exceptOnce?: string[];
    mergeIntent?: "append" | "prepend";
  } = {},
): InertiaRequestInfo {
  return makeRequest({
    isInertia: true,
    partialComponent: component,
    partialOnly: opts.only ?? null,
    partialExcept: opts.except ?? null,
    resetKeys: opts.reset ?? null,
    exceptOnceProps: opts.exceptOnce ?? [],
    mergeIntent: opts.mergeIntent ?? "append",
    isPrefetch: false,
  });
}
