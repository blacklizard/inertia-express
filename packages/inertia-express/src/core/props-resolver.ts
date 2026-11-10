import { unpackDotProps } from './dot-props.js';
import { leadsToOnly, matchesExcept, matchesOnly } from './partial-filter.js';
import { isPropDescriptor } from './props.js';

import type PropDescriptor from './prop-descriptor.js';
import type {
  InertiaRequestInfo, LiveMetadata, OnceMetadata, PageProps, PropsMetadata, RescueHandler, ScrollMetadata,
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
 * Default rescue hook: log the rescued error with the prop's path.
 *
 * @param error The thrown value.
 * @param path Dot path of the rescued prop.
 */
function reportRescuedError(error: unknown, path: string): void {
  console.error(`Inertia prop '${path}' failed to resolve and was rescued.`, error);
}

/**
 * Report a failure of a custom rescue hook through the default reporter:
 * the original rescued error, then the hook's own error.
 *
 * @param hookError The value the hook threw or rejected with.
 * @param error The rescued error the hook was given.
 * @param path Dot path of the rescued prop.
 */
function reportHookFailure(hookError: unknown, error: unknown, path: string): void {
  reportRescuedError(error, path);
  console.error(`Inertia onRescue hook failed while reporting prop '${path}'.`, hookError);
}

/**
 * Marker returned by a settled entry that is left out of its parent node.
 */
const EXCLUDED: unique symbol = Symbol('excluded');

/**
 * An error thrown by a rescuable descriptor, carried to the walk so the
 * rescue is recorded in insertion order.
 */
interface Rescued {
  /** The thrown value. */
  error: unknown;
}

/**
 * Every {@link Rescued} wrapper created by {@link rescued}.
 */
const rescuedMarkers = new WeakSet();

/**
 * Wrap a rescued error.
 *
 * @param error The thrown value.
 */
function rescued(error: unknown): Rescued {
  const marker = { error };
  rescuedMarkers.add(marker);

  return marker;
}

/**
 * `true` when `value` is a wrapper created by {@link rescued}.
 *
 * @param value A resolved value.
 */
function isRescued(value: unknown): value is Rescued {
  return typeof value === 'object' && value !== null && rescuedMarkers.has(value);
}

/**
 * One included entry of a node, classified before any entry is awaited.
 */
interface Entry {
  /** Key of the entry in its parent node. */
  key: string;
  /** Dot path of the entry. */
  path: string;
  /** The prop as found in its parent node. */
  prop: unknown;
  /** Whether the entry is excluded from the initial load. */
  excluded: boolean;
  /** The started resolution, or `null` for excluded entries and plain values. */
  pending: Promise<unknown> | null;
}

/**
 * `true` when a prop must be resolved asynchronously: a descriptor, a
 * function, or a thenable. Anything else is copied as is.
 *
 * @param prop The prop as found in its parent node.
 */
function needsResolution(prop: unknown): boolean {
  if (typeof prop === 'function') {
    return true;
  }

  if (prop === null || typeof prop !== 'object') {
    return false;
  }

  return isPropDescriptor(prop) || typeof (prop as { then?: unknown }).then === 'function';
}

/**
 * Swallow a rejection on a started resolution that may never be awaited
 * because an earlier sibling failed; the awaited copy still rejects.
 */
function ignoreRejection(): void {}

/**
 * Write a settled entry into the node being built, skipping excluded entries.
 * Object keys are written as own data properties, so `__proto__` never
 * reaches the prototype setter.
 *
 * @param result Node being built; written in place.
 * @param key Key of the entry.
 * @param outcome Settled value, or {@link EXCLUDED}.
 */
function writeEntry(result: Node, key: string, outcome: unknown): void {
  if (outcome === EXCLUDED) {
    return;
  }

  if (Array.isArray(result)) {
    result.push(outcome);
  } else if (key === '__proto__') {
    Object.defineProperty(result, key, {
      value: outcome, enumerable: true, writable: true, configurable: true,
    });
  } else {
    // eslint-disable-next-line no-param-reassign -- result is the fresh node this walk is building
    result[key] = outcome;
  }
}

/**
 * Where a mergeable prop merges for one request: at its root (appending or
 * prepending) or at the listed child paths.
 */
interface MergeLayout {
  appendsAtRoot: boolean;
  prependsAtRoot: boolean;
  appendPaths: readonly string[];
  prependPaths: readonly string[];
}

/**
 * Resolves shared and page props for one response, applying partial-reload
 * filtering and initial-load exclusion and collecting page metadata. Port of
 * inertia-laravel's `PropsResolver`. Use one instance per response: the
 * instance accumulates metadata, so {@link PropsResolver.resolve} throws when
 * called a second time. The resolver only reads descriptors, never writes
 * them. Metadata maps keyed by user input (`deferredProps`, `scrollProps`,
 * `onceProps`) have a null prototype, so any key, `__proto__` included, is
 * stored as an own property.
 */
export default class PropsResolver {
  private readonly request: InertiaRequestInfo;

  private readonly component: string;

  private readonly onRescue: RescueHandler;

  private readonly isPartial: boolean;

  private readonly isInertia: boolean;

  private readonly only: string[] | null;

  private readonly except: string[] | null;

  private readonly sharedPropKeys: string[] = [];

  private readonly mergeProps: string[] = [];

  private readonly prependProps: string[] = [];

  private readonly deepMergeProps: string[] = [];

  private readonly matchPropsOn: string[] = [];

  private readonly deferredProps = Object.create(null) as Record<string, string[]>;

  private readonly rescuedProps: string[] = [];

  private readonly scrollProps = Object.create(null) as Record<string, ScrollMetadata & { reset: boolean }>;

  private readonly onceProps = Object.create(null) as Record<string, OnceMetadata>;

  private readonly liveProps = Object.create(null) as Record<string, LiveMetadata>;

  private used = false;

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
    this.onRescue = onRescue ?? reportRescuedError;
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
    this.markUsed();
    const combined = { ...this.resolveSharedProps(shared), ...props };
    const resolved = await this.walk(await unpackDotProps(combined), '', false);

    return { props: resolved as PageProps, metadata: this.buildMetadata() };
  }

  /**
   * Resolve props for a socket broadcast payload: every prop is resolved, with
   * no partial filtering, once/defer exclusion, metadata or dotted-key
   * unpacking. Siblings resolve concurrently and keep insertion order; rescued
   * props are reported and omitted; plain objects and arrays are recursed into.
   *
   * @param props Props to resolve.
   */
  async resolveBroadcast(props: PageProps): Promise<PageProps> {
    this.markUsed();

    return await this.broadcastNode(props, '') as PageProps;
  }

  /**
   * Fail when this resolver has already been used; otherwise mark it used.
   */
  private markUsed(): void {
    if (this.used) {
      throw new Error('PropsResolver.resolve() was already called on this instance; create one resolver per response.');
    }

    this.used = true;
  }

  /**
   * Resolve one level of a broadcast payload.
   *
   * @param node Plain object or array whose entries are resolved.
   * @param prefix Dot path of the node, empty at the root.
   */
  private async broadcastNode(node: Node, prefix: string): Promise<Node> {
    const keys = Object.keys(node);
    const values = await Promise.all(keys.map(async (key) => (
      this.broadcastEntry((node as Record<string, unknown>)[key], prefix === '' ? key : `${prefix}.${key}`)
    )));

    if (Array.isArray(node)) {
      return values.filter((value) => value !== EXCLUDED);
    }

    const result = Object.create(null) as Record<string, unknown>;

    keys.forEach((key, index) => {
      if (values[index] !== EXCLUDED) {
        result[key] = values[index];
      }
    });

    return result;
  }

  /**
   * Resolve a single broadcast entry, unwrapping one level of returned descriptor.
   *
   * @param prop The entry's raw value.
   * @param path Dot path of the entry.
   */
  private async broadcastEntry(prop: unknown, path: string): Promise<unknown> {
    let value = await this.resolveValue(prop);

    if (isRescued(value)) {
      return this.rescue(value.error, path);
    }

    if (value !== prop && this.isPropType(value)) {
      value = await this.resolveValue(value);

      if (isRescued(value)) {
        return this.rescue(value.error, path);
      }
    }

    return isPlainObjectOrArray(value) ? this.broadcastNode(value, path) : value;
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
      ['liveProps', this.liveProps],
    ];

    return Object.fromEntries(entries.filter(([, value]) => Object.keys(value).length > 0));
  }

  /**
   * Recursively resolve a props node, collecting metadata along the way.
   * Every included entry that needs resolving is started in insertion order
   * before any is awaited, so siblings resolve concurrently; each entry is
   * then settled in insertion order (rescue, one-level unwrap, metadata,
   * recursion), keeping output key order and metadata order deterministic.
   * Plain values are copied synchronously, so a node without closures or
   * descriptors comes back without a promise. Arrays come back as arrays
   * with excluded entries dropped, so later index-based `except`/`reset`
   * paths shift down; objects come back as fresh plain objects. When the
   * original prop was not itself a plain object or array (e.g. a closure
   * that returned one), its children bypass partial filtering.
   *
   * @param node Plain object or array to walk.
   * @param prefix Dot path of `node`, or `''` at the root.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private walk(node: Node, prefix: string, parentWasResolved: boolean): Node | Promise<Node> {
    const entries = this.startEntries(node, prefix, parentWasResolved);
    const result: Node = Array.isArray(node) ? [] : {};

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index] as Entry;
      const outcome = this.settleEntry(entry, parentWasResolved);

      if (outcome instanceof Promise) {
        return this.finishWalk(entries, index, outcome, result, parentWasResolved);
      }

      writeEntry(result, entry.key, outcome);
    }

    return result;
  }

  /**
   * Continue a walk asynchronously from the first entry whose outcome is pending.
   *
   * @param entries Started entries of the node.
   * @param index Index of the pending entry.
   * @param pending Outcome of the entry at `index`.
   * @param result Node being built; written in place.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private async finishWalk(
    entries: Entry[],
    index: number,
    pending: Promise<unknown>,
    result: Node,
    parentWasResolved: boolean,
  ): Promise<Node> {
    writeEntry(result, (entries[index] as Entry).key, await pending);

    for (let next = index + 1; next < entries.length; next += 1) {
      const entry = entries[next] as Entry;
      const outcome = this.settleEntry(entry, parentWasResolved);

      // eslint-disable-next-line no-await-in-loop -- entries are settled one at a time in insertion order; their sources already run concurrently
      writeEntry(result, entry.key, outcome instanceof Promise ? await outcome : outcome);
    }

    return result;
  }

  /**
   * Run the synchronous pre-resolve checks (partial filter, initial-load
   * exclusion) over a node's entries in insertion order and start resolving
   * every included entry that needs it.
   *
   * @param node Plain object or array to walk.
   * @param prefix Dot path of `node`, or `''` at the root.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private startEntries(node: Node, prefix: string, parentWasResolved: boolean): Entry[] {
    const entries: Entry[] = [];

    const visit = (prop: unknown, key: string): void => {
      const path = prefix === '' ? key : `${prefix}.${key}`;

      if (this.shouldIncludeInPartialResponse(prop, path, parentWasResolved)) {
        entries.push(this.startEntry(key, path, prop));
      }
    };

    if (Array.isArray(node)) {
      node.forEach((prop, index) => visit(prop, String(index)));
    } else {
      Object.keys(node).forEach((key) => visit(node[key], key));
    }

    return entries;
  }

  /**
   * Classify one included entry: excluded from the initial load, pending
   * resolution (started now), or a plain value copied as is.
   *
   * @param key Key of the entry in its parent node.
   * @param path Dot path of the entry.
   * @param prop The prop as found in its parent node.
   */
  private startEntry(key: string, path: string, prop: unknown): Entry {
    if (!this.isPartial && this.isExcludedFromInitialResponse(prop, path)) {
      return {
        key, path, prop, excluded: true, pending: null,
      };
    }

    if (needsResolution(prop)) {
      const pending = this.resolveValue(prop);
      pending.catch(ignoreRejection);

      return {
        key, path, prop, excluded: false, pending,
      };
    }

    return {
      key, path, prop, excluded: false, pending: null,
    };
  }

  /**
   * Finish one started entry in insertion order. Returns the value to write,
   * {@link EXCLUDED}, or a promise of either when the entry needs awaiting.
   *
   * @param entry The started entry.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private settleEntry(entry: Entry, parentWasResolved: boolean): unknown {
    if (entry.excluded) {
      this.collectExclusionMetadata(entry.prop as PropDescriptor, entry.path);

      return EXCLUDED;
    }

    if (entry.pending !== null) {
      return this.settleResolved(entry, entry.pending, parentWasResolved);
    }

    return this.include(entry.prop, entry.prop, entry.path, parentWasResolved);
  }

  /**
   * Await a started resolution, then apply rescue, the one-level descriptor
   * unwrap (with its own initial-load exclusion) and inclusion.
   *
   * @param entry The started entry.
   * @param pending The entry's resolution.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private async settleResolved(entry: Entry, pending: Promise<unknown>, parentWasResolved: boolean): Promise<unknown> {
    const { path } = entry;
    let current = entry.prop;
    let value = await pending;

    if (isRescued(value)) {
      return this.rescue(value.error, path);
    }

    if (value !== current && this.isPropType(value)) {
      current = value;

      if (!this.isPartial && this.isExcludedFromInitialResponse(current, path)) {
        this.collectExclusionMetadata(current, path);

        return EXCLUDED;
      }

      value = await this.resolveValue(current);

      if (isRescued(value)) {
        return this.rescue(value.error, path);
      }
    }

    return this.include(current, value, path, parentWasResolved);
  }

  /**
   * Include a resolved prop: check scroll shape, collect metadata, and walk
   * into plain objects and arrays.
   *
   * @param prop The prop that produced `value`.
   * @param value The prop's resolved value.
   * @param path Dot path of the prop.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private include(prop: unknown, value: unknown, path: string, parentWasResolved: boolean): unknown {
    this.assertScrollShape(prop, path, value);
    this.collectMetadata(prop, path, value, parentWasResolved);

    if (isPlainObjectOrArray(value)) {
      return this.walk(value, path, parentWasResolved || !isPlainObjectOrArray(prop));
    }

    return value;
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
   * prefix matching on both the only list and the except list.
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
   * Determine if a prop is excluded from the initial page response: an
   * optional or deferred descriptor, or a once-prop the client already holds.
   *
   * @param prop The prop being considered.
   * @param path Dot path of the prop.
   */
  private isExcludedFromInitialResponse(prop: unknown, path: string): prop is PropDescriptor {
    if (!isPropDescriptor(prop)) {
      return false;
    }

    return prop.ignoreFirstLoad
      || prop.defers
      || (this.isInertia && this.wasAlreadyLoadedByClient(prop, path));
  }

  /**
   * Collect the metadata of a prop excluded from the initial response
   * according to why it was excluded.
   *
   * @param prop The descriptor being excluded.
   * @param path Dot path of the prop.
   */
  private collectExclusionMetadata(prop: PropDescriptor, path: string): void {
    if (prop.isLive) {
      this.collectLiveMetadata(path, prop, false);
    }

    if (prop.ignoreFirstLoad) {
      this.collectIgnoredPropMetadata(prop, path);
    } else if (prop.defers) {
      this.collectDeferredExclusionMetadata(prop, path);
    } else {
      this.collectOnceMetadata(path, prop);
    }
  }

  /**
   * Collect the deferred, merge and once metadata of an excluded
   * first-load-ignored prop (optional, defer).
   *
   * @param prop The descriptor being excluded.
   * @param path Dot path of the prop.
   */
  private collectIgnoredPropMetadata(prop: PropDescriptor, path: string): void {
    if (prop.defers && !this.wasAlreadyLoadedByClient(prop, path)) {
      this.collectDeferredPropMetadata(path, prop);
    }

    if (prop.merges) {
      this.collectMergeableMetadata(path, prop, true);
    }

    if (prop.resolvesOnce) {
      this.collectOnceMetadata(path, prop);
    }
  }

  /**
   * Collect the deferred-group and merge metadata of an excluded deferred prop.
   *
   * @param prop The descriptor being excluded.
   * @param path Dot path of the prop.
   */
  private collectDeferredExclusionMetadata(prop: PropDescriptor, path: string): void {
    this.collectDeferredPropMetadata(path, prop);

    if (prop.merges) {
      this.collectMergeableMetadata(path, prop, true);
    }
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
   * function is called, and the result is awaited; anything else passes
   * through. An error thrown by a rescuable descriptor comes back wrapped in
   * {@link Rescued}; any other error rejects.
   *
   * @param prop The prop to resolve.
   */
  // eslint-disable-next-line class-methods-use-this
  private async resolveValue(prop: unknown): Promise<unknown> {
    try {
      if (isPropDescriptor(prop)) {
        return await prop.resolveSource();
      }

      if (typeof prop === 'function') {
        return await (prop as () => unknown)();
      }

      return await prop;
    } catch (error) {
      if (isPropDescriptor(prop) && prop.rescues) {
        return rescued(error);
      }

      throw error;
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
   * Record a rescued prop: report the error, add its path to `rescuedProps`
   * and omit it from the response.
   *
   * @param error The thrown value.
   * @param path Dot path of the prop.
   */
  private rescue(error: unknown, path: string): typeof EXCLUDED {
    this.reportRescue(error, path);
    this.rescuedProps.push(path);

    return EXCLUDED;
  }

  /**
   * Call the rescue hook with the failure contained: a synchronous throw or
   * a rejected returned thenable is logged through the default reporter and
   * never propagates or surfaces as an unhandled rejection.
   *
   * @param error The thrown value.
   * @param path Dot path of the prop.
   */
  private reportRescue(error: unknown, path: string): void {
    const hook: (error: unknown, path: string) => unknown = this.onRescue;

    try {
      const result = hook(error, path);

      if (result !== null && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function') {
        Promise.resolve(result).catch((hookError: unknown) => reportHookFailure(hookError, error, path));
      }
    } catch (hookError) {
      reportHookFailure(hookError, error, path);
    }
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
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private collectMetadata(prop: unknown, path: string, resolved: unknown, parentWasResolved: boolean): void {
    if (!isPropDescriptor(prop)) {
      return;
    }

    if (prop.merges) {
      this.collectMergeableMetadata(path, prop, false);
    }

    if (prop.isScroll) {
      this.collectScrollMetadata(path, prop, resolved);
    }

    if (prop.resolvesOnce) {
      this.collectOnceMetadata(path, prop);
    }

    if (prop.isLive) {
      this.collectLiveMetadata(path, prop, parentWasResolved);
    }
  }

  /**
   * Collect the listener manifest of a live prop, unless a partial request
   * filters it out. Listener errors are not rescued.
   *
   * @param path Dot path of the prop.
   * @param prop The live descriptor.
   * @param parentWasResolved Whether an ancestor was produced by resolving a closure or descriptor.
   */
  private collectLiveMetadata(path: string, prop: PropDescriptor, parentWasResolved: boolean): void {
    if (
      this.isPartial
      && !this.bypassesPartialFiltering(prop, parentWasResolved)
      && !this.isIncludedInPartialMetadata(path)
    ) {
      return;
    }

    this.liveProps[path] = {
      listeners: prop.liveListeners(),
      ...(prop.liveThrottle !== null ? { throttle: prop.liveThrottle } : {}),
    };
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
   * @param excluded Whether the prop is being excluded from this response rather than resolved.
   */
  private collectMergeableMetadata(path: string, prop: PropDescriptor, excluded: boolean): void {
    if (this.request.resetKeys?.includes(path)) {
      return;
    }

    if (this.isPartial && !this.isIncludedInPartialMetadata(path)) {
      return;
    }

    const layout = this.mergeLayoutFor(prop, excluded);

    if (prop.deep) {
      this.deepMergeProps.push(path);
    } else if (layout.appendsAtRoot) {
      this.mergeProps.push(path);
    } else if (layout.prependsAtRoot) {
      this.prependProps.push(path);
    } else {
      this.mergeProps.push(...layout.appendPaths.map((appendPath) => `${path}.${appendPath}`));
      this.prependProps.push(...layout.prependPaths.map((prependPath) => `${path}.${prependPath}`));
    }

    this.matchPropsOn.push(...prop.matchOnPaths.map((matchOn) => `${path}.${matchOn}`));
  }

  /**
   * The merge layout of a descriptor for this request, read without writing
   * to the descriptor. A scroll descriptor derives its layout per request:
   * a root append while it is excluded as deferred, otherwise its wrapper key
   * appended or prepended according to the client's merge intent (the
   * read-only equivalent of `ScrollProp::configureMergeIntent`).
   *
   * @param prop The mergeable descriptor.
   * @param excluded Whether the prop is being excluded from this response rather than resolved.
   */
  private mergeLayoutFor(prop: PropDescriptor, excluded: boolean): MergeLayout {
    if (!prop.isScroll) {
      return prop;
    }

    if (excluded) {
      return {
        appendsAtRoot: true, prependsAtRoot: false, appendPaths: [], prependPaths: [],
      };
    }

    const prepends = this.request.mergeIntent === 'prepend';

    return {
      appendsAtRoot: false,
      prependsAtRoot: false,
      appendPaths: prepends ? [] : [prop.wrapper],
      prependPaths: prepends ? [prop.wrapper] : [],
    };
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
