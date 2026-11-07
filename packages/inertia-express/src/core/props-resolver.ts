import { unpackDotProps } from './dot-props.js';
import { leadsToOnly, matchesExcept, matchesOnly } from './partial-filter.js';
import { isPropDescriptor } from './props.js';

import type PropDescriptor from './prop-descriptor.js';
import type {
  InertiaRequestInfo, OnceMetadata, PageProps, PropsMetadata, RescueHandler, ScrollMetadata,
} from './types.js';

/**
 * Input to {@link resolveProps}.
 */
export interface ResolvePropsInput {
  /** Page props for the component being rendered. */
  props: PageProps;
  /** Already-evaluated shared props; page props win on key collision. */
  shared: PageProps;
  /** Component being rendered; a partial reload only applies when it matches. */
  component: string;
  /** Normalized Inertia request state. */
  request: InertiaRequestInfo;
  /** Hook called when a rescued prop throws. */
  onRescue?: RescueHandler;
}

/**
 * Output of {@link resolveProps}.
 */
export interface ResolvePropsResult {
  /** Fully resolved props tree. */
  props: PageProps;
  /** Page-level metadata; only non-empty keys are present. */
  metadata: PropsMetadata;
}

type Node = Record<string, unknown> | unknown[];

/**
 * `true` for arrays and for objects whose prototype is `Object.prototype` or `null`.
 *
 * @param value Value to test.
 */
function isPlainObjectOrArray(value: unknown): value is Node {
  if (Array.isArray(value)) {
    return true;
  }

  if (value === null || typeof value !== 'object') {
    return false;
  }

  const proto = Object.getPrototypeOf(value) as unknown;

  return proto === Object.prototype || proto === null;
}

/**
 * Normalize a partial header list: empty entries are dropped and an empty list becomes `null`.
 *
 * @param list Parsed header list, or `null` when absent.
 */
function normalizeList(list: string[] | null): string[] | null {
  const entries = (list ?? []).filter((entry) => entry !== '');

  return entries.length > 0 ? entries : null;
}

/**
 * Resolves shared and page props for one response, applying partial-reload
 * filtering and initial-load exclusion and collecting page metadata. Port of
 * inertia-laravel's `PropsResolver`.
 */
export default class PropsResolver {
  private readonly request: InertiaRequestInfo;

  private readonly component: string;

  private readonly onRescue: RescueHandler | undefined;

  private readonly isPartial: boolean;

  private readonly isInertia: boolean;

  private readonly only: string[] | null;

  private readonly except: string[] | null;

  private readonly sharedPropKeys: string[] = [];

  private readonly mergeProps: string[] = [];

  private readonly prependProps: string[] = [];

  private readonly deepMergeProps: string[] = [];

  private readonly matchPropsOn: string[] = [];

  private readonly deferredProps: Record<string, string[]> = {};

  private readonly rescuedProps: string[] = [];

  private readonly scrollProps: Record<string, ScrollMetadata & { reset: boolean }> = {};

  private readonly onceProps: Record<string, OnceMetadata> = {};

  /**
   * Create a resolver for one request and component.
   *
   * @param request Normalized Inertia request state.
   * @param component Component being rendered.
   * @param onRescue Hook called when a rescued prop throws.
   */
  constructor(request: InertiaRequestInfo, component: string, onRescue?: RescueHandler) {
    this.request = request;
    this.component = component;
    this.onRescue = onRescue;
    this.isPartial = request.partialComponent === component;
    this.isInertia = request.isInertia;
    this.only = normalizeList(request.partialOnly);
    this.except = normalizeList(request.partialExcept);
  }

  /**
   * Resolve the given shared and page props, collecting their metadata.
   *
   * @param shared Already-evaluated shared props.
   * @param props Page props; these win over shared props on collision.
   */
  async resolve(shared: PageProps, props: PageProps): Promise<ResolvePropsResult> {
    const combined = { ...this.resolveSharedProps(shared), ...props };
    const resolved = await this.walk(await unpackDotProps(combined), '', false);

    return { props: resolved as PageProps, metadata: this.buildMetadata() };
  }

  /**
   * Record the top-level keys of shared props (the segment before the first
   * `.` for dot-notation keys), deduplicated in first-seen order.
   *
   * @param shared Already-evaluated shared props.
   */
  private resolveSharedProps(shared: PageProps): PageProps {
    Object.keys(shared).forEach((key) => {
      const [topLevel = key] = key.split('.', 1);

      if (!this.sharedPropKeys.includes(topLevel)) {
        this.sharedPropKeys.push(topLevel);
      }
    });

    return shared;
  }

  /**
   * Build the non-empty metadata entries for the page response, in protocol order.
   */
  private buildMetadata(): PropsMetadata {
    const entries: [keyof PropsMetadata, string[] | Record<string, unknown>][] = [
      ['sharedProps', this.sharedPropKeys],
      ['mergeProps', this.mergeProps],
      ['prependProps', this.prependProps],
      ['deepMergeProps', this.deepMergeProps],
      ['matchPropsOn', this.matchPropsOn],
      ['deferredProps', this.deferredProps],
      ['rescuedProps', this.rescuedProps],
      ['scrollProps', this.scrollProps],
      ['onceProps', this.onceProps],
    ];

    return Object.fromEntries(entries.filter(([, value]) => Object.keys(value).length > 0));
  }

  /**
   * Recursively resolve a props node sequentially in insertion order,
   * collecting metadata along the way. Arrays come back as arrays, with
   * excluded entries dropped; objects come back as fresh plain objects.
   * When the original prop was not itself a plain object or array (e.g. a
   * closure that returned one), its children bypass partial filtering.
   *
   * @param node Plain object or array to walk.
   * @param prefix Dot path of `node`, or `''` at the root.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private async walk(node: Node, prefix: string, parentWasResolved: boolean): Promise<Node> {
    const isArray = Array.isArray(node);
    const entries: [string, unknown][] = isArray
      ? node.map((value, index): [string, unknown] => [String(index), value])
      : Object.entries(node);

    const included = await entries.reduce<Promise<[string, unknown][]>>(async (pending, [key, value]) => {
      const accumulated = await pending;
      const path = prefix === '' ? key : `${prefix}.${key}`;
      const outcome = await this.resolveEntry(value, path, parentWasResolved);

      return outcome.included ? [...accumulated, [key, outcome.value]] : accumulated;
    }, Promise.resolve([]));

    if (isArray) {
      return included.map(([, value]) => value);
    }

    return included.reduce<Record<string, unknown>>((result, [key, value]) => {
      Object.defineProperty(result, key, {
        value, enumerable: true, writable: true, configurable: true,
      });

      return result;
    }, {});
  }

  /**
   * Run one prop through the per-node pipeline: partial filter, initial-load
   * exclusion, resolution, one-level descriptor unwrap, metadata, recursion.
   *
   * @param prop The prop as found in its parent node.
   * @param path Dot path of the prop.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private async resolveEntry(
    prop: unknown,
    path: string,
    parentWasResolved: boolean,
  ): Promise<{ included: false } | { included: true; value: unknown }> {
    if (!this.shouldIncludeInPartialResponse(prop, path, parentWasResolved)) {
      return { included: false };
    }

    if (!this.isPartial && this.excludeFromInitialResponse(prop, path)) {
      return { included: false };
    }

    let current = prop;
    let value = await this.resolveValue(current, path);

    if (this.rescuedProps.includes(path)) {
      return { included: false };
    }

    if (value !== current && this.isPropType(value)) {
      current = value;

      if (!this.isPartial && this.excludeFromInitialResponse(current, path)) {
        return { included: false };
      }

      value = await this.resolveValue(current, path);
    }

    this.assertScrollShape(current, path, value);
    this.collectMetadata(current, path, value, parentWasResolved);

    if (isPlainObjectOrArray(value)) {
      return {
        included: true,
        value: await this.walk(value, path, parentWasResolved || !isPlainObjectOrArray(current)),
      };
    }

    return { included: true, value };
  }

  /**
   * Determine if a prop belongs in the response: always on a full visit;
   * on a partial reload, when it bypasses filtering or its path matches the request.
   *
   * @param prop The prop being considered.
   * @param path Dot path of the prop.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private shouldIncludeInPartialResponse(prop: unknown, path: string, parentWasResolved: boolean): boolean {
    if (!this.isPartial || this.bypassesPartialFiltering(prop, parentWasResolved)) {
      return true;
    }

    return this.pathMatchesPartialRequest(path);
  }

  /**
   * Determine if a prop is resolved independently of partial filters:
   * always props, and children of already-resolved values.
   *
   * @param prop The prop being considered.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  // eslint-disable-next-line class-methods-use-this
  private bypassesPartialFiltering(prop: unknown, parentWasResolved: boolean): boolean {
    return (isPropDescriptor(prop) && prop.isAlways) || parentWasResolved;
  }

  /**
   * Determine if the path matches the partial request using bidirectional
   * prefix matching on the only list and descendant matching on the except list.
   *
   * @param path Dot path of the prop.
   */
  private pathMatchesPartialRequest(path: string): boolean {
    if (this.only !== null && !matchesOnly(path, this.only) && !leadsToOnly(path, this.only)) {
      return false;
    }

    if (this.except !== null && matchesExcept(path, this.except)) {
      return false;
    }

    return true;
  }

  /**
   * Determine if a prop is excluded from the initial page response. Each
   * exclusion type collects its metadata before the prop is removed.
   *
   * @param prop The prop being considered.
   * @param path Dot path of the prop.
   */
  private excludeFromInitialResponse(prop: unknown, path: string): boolean {
    if (!isPropDescriptor(prop)) {
      return false;
    }

    if (prop.ignoreFirstLoad) {
      return this.excludeIgnoredProp(prop, path);
    }

    if (prop.defers) {
      return this.excludeDeferredProp(prop, path);
    }

    if (this.isInertia && this.wasAlreadyLoadedByClient(prop, path)) {
      return this.excludeAlreadyLoadedProp(prop, path);
    }

    return false;
  }

  /**
   * Exclude a first-load-ignored prop (optional, defer) while collecting its
   * deferred, merge and once metadata.
   *
   * @param prop The descriptor being excluded.
   * @param path Dot path of the prop.
   */
  private excludeIgnoredProp(prop: PropDescriptor, path: string): boolean {
    if (prop.defers && !this.wasAlreadyLoadedByClient(prop, path)) {
      this.collectDeferredPropMetadata(path, prop);
    }

    if (prop.merges) {
      this.collectMergeableMetadata(path, prop);
    }

    if (prop.resolvesOnce) {
      this.collectOnceMetadata(path, prop);
    }

    return true;
  }

  /**
   * Exclude a deferred prop while collecting its deferred-group and merge metadata.
   *
   * @param prop The descriptor being excluded.
   * @param path Dot path of the prop.
   */
  private excludeDeferredProp(prop: PropDescriptor, path: string): boolean {
    this.collectDeferredPropMetadata(path, prop);

    if (prop.merges) {
      this.collectMergeableMetadata(path, prop);
    }

    return true;
  }

  /**
   * Exclude a once-prop the client already holds while preserving its once metadata.
   *
   * @param prop The descriptor being excluded.
   * @param path Dot path of the prop.
   */
  private excludeAlreadyLoadedProp(prop: PropDescriptor, path: string): boolean {
    this.collectOnceMetadata(path, prop);

    return true;
  }

  /**
   * Determine if a once-prop has already been loaded by the client: it
   * resolves once, is not forced fresh, and its key (or path) is listed in
   * the client's except-once header.
   *
   * @param prop The descriptor being considered.
   * @param path Dot path of the prop.
   */
  private wasAlreadyLoadedByClient(prop: PropDescriptor, path: string): boolean {
    return prop.resolvesOnce
      && !prop.isFresh
      && this.request.exceptOnceProps.includes(prop.onceKey ?? path);
  }

  /**
   * Resolve a single prop value: a descriptor resolves its source, a bare
   * function is called, and the result is awaited; anything else passes through.
   * A scroll descriptor first has its merge intent configured from the request.
   *
   * @param prop The prop to resolve.
   * @param path Dot path of the prop.
   */
  private async resolveValue(prop: unknown, path: string): Promise<unknown> {
    if (isPropDescriptor(prop) && prop.isScroll) {
      this.configureMergeIntent(prop);
    }

    try {
      if (isPropDescriptor(prop)) {
        return await prop.resolveSource();
      }

      if (typeof prop === 'function') {
        return await (prop as () => unknown)();
      }

      return prop;
    } catch (error) {
      return this.rescue(error, prop, path);
    }
  }

  /**
   * Point a scroll descriptor's merge at its wrapper key, prepending when the
   * client's merge intent is `prepend` and appending otherwise. Paths from an
   * earlier request are cleared first so a reused descriptor is reconfigured.
   * Port of `ScrollProp::configureMergeIntent`.
   *
   * @param prop The scroll descriptor.
   */
  private configureMergeIntent(prop: PropDescriptor): void {
    prop.appendPaths.splice(0);
    prop.prependPaths.splice(0);

    if (this.request.mergeIntent === 'prepend') {
      prop.prepend(prop.wrapper);
    } else {
      prop.append(prop.wrapper);
    }
  }

  /**
   * Throw when a scroll prop did not resolve to a plain object holding its
   * wrapper key as an own property.
   *
   * @param prop The prop being included.
   * @param path Dot path of the prop.
   * @param resolved The prop's resolved value.
   */
  // eslint-disable-next-line class-methods-use-this
  private assertScrollShape(prop: unknown, path: string, resolved: unknown): void {
    if (!isPropDescriptor(prop) || !prop.isScroll) {
      return;
    }

    if (Array.isArray(resolved) || !isPlainObjectOrArray(resolved) || !Object.hasOwn(resolved, prop.wrapper)) {
      throw new TypeError(`Scroll prop '${path}' must resolve to an object with a '${prop.wrapper}' key`);
    }
  }

  /**
   * Handle an error thrown while resolving a prop. Stub: rethrows; Task 8
   * adds rescue reporting and `rescuedProps` bookkeeping.
   *
   * @param error The thrown value.
   * @param _prop The prop that threw.
   * @param _path Dot path of the prop.
   */
  // eslint-disable-next-line class-methods-use-this
  private rescue(error: unknown, _prop: unknown, _path: string): never {
    throw error;
  }

  /**
   * Determine if the value is a prop type that needs further filtering or
   * metadata collection.
   *
   * @param value The resolved value.
   */
  // eslint-disable-next-line class-methods-use-this
  private isPropType(value: unknown): value is PropDescriptor {
    return isPropDescriptor(value);
  }

  /**
   * Collect metadata for a prop that will be included in the response.
   *
   * @param prop The prop being included.
   * @param path Dot path of the prop.
   * @param resolved The prop's resolved value.
   * @param _parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private collectMetadata(prop: unknown, path: string, resolved: unknown, _parentWasResolved: boolean): void {
    if (!isPropDescriptor(prop)) {
      return;
    }

    if (prop.merges) {
      this.collectMergeableMetadata(path, prop);
    }

    if (prop.isScroll) {
      this.collectScrollMetadata(path, prop, resolved);
    }

    if (prop.resolvesOnce) {
      this.collectOnceMetadata(path, prop);
    }
  }

  /**
   * Collect the deferred prop under its group.
   *
   * @param path Dot path of the prop.
   * @param prop The deferred descriptor.
   */
  private collectDeferredPropMetadata(path: string, prop: PropDescriptor): void {
    const group = this.deferredProps[prop.group] ?? [];
    group.push(path);
    this.deferredProps[prop.group] = group;
  }

  /**
   * Collect the merge strategy for a mergeable prop, unless the client asked
   * to reset it or a partial request filters it out.
   *
   * @param path Dot path of the prop.
   * @param prop The mergeable descriptor.
   */
  private collectMergeableMetadata(path: string, prop: PropDescriptor): void {
    if (this.request.resetKeys?.includes(path)) {
      return;
    }

    if (this.isPartial && !this.isIncludedInPartialMetadata(path)) {
      return;
    }

    if (prop.deep) {
      this.deepMergeProps.push(path);
    } else if (prop.appendsAtRoot) {
      this.mergeProps.push(path);
    } else if (prop.prependsAtRoot) {
      this.prependProps.push(path);
    } else {
      this.mergeProps.push(...prop.appendPaths.map((appendPath) => `${path}.${appendPath}`));
      this.prependProps.push(...prop.prependPaths.map((prependPath) => `${path}.${prependPath}`));
    }

    this.matchPropsOn.push(...prop.matchOnPaths.map((matchOn) => `${path}.${matchOn}`));
  }

  /**
   * Determine if the path should contribute metadata during a partial request.
   *
   * @param path Dot path of the prop.
   */
  private isIncludedInPartialMetadata(path: string): boolean {
    if (this.only !== null && !matchesOnly(path, this.only)) {
      return false;
    }

    if (this.except !== null && matchesExcept(path, this.except)) {
      return false;
    }

    return true;
  }

  /**
   * Collect scroll pagination metadata, flagged for reset when the client
   * asked to reset the prop.
   *
   * @param path Dot path of the prop.
   * @param prop The scroll descriptor.
   * @param resolved The prop's resolved value.
   */
  private collectScrollMetadata(path: string, prop: PropDescriptor, resolved: unknown): void {
    this.scrollProps[path] = {
      ...prop.metadataFor(resolved),
      reset: this.request.resetKeys?.includes(path) ?? false,
    };
  }

  /**
   * Collect once-prop metadata under its custom key (or path), unless a
   * partial request filters it out.
   *
   * @param path Dot path of the prop.
   * @param prop The once descriptor.
   */
  private collectOnceMetadata(path: string, prop: PropDescriptor): void {
    if (!prop.resolvesOnce) {
      return;
    }

    if (this.isPartial && !this.isIncludedInPartialMetadata(path)) {
      return;
    }

    this.onceProps[prop.onceKey ?? path] = { prop: path, expiresAt: prop.expiresAt() };
  }
}

/**
 * Resolve shared and page props for one response.
 *
 * @param input Props, shared props, component, request state and rescue hook.
 */
export async function resolveProps(input: ResolvePropsInput): Promise<ResolvePropsResult> {
  return new PropsResolver(input.request, input.component, input.onRescue).resolve(input.shared, input.props);
}
