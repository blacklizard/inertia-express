import { isPropDescriptor } from './props.js';

import type { PageProps } from './types.js';

type Container = Record<string, unknown>;

/**
 * Calls and awaits `value` when it is a bare function; returns anything else unchanged.
 *
 * @param value Prop value or closure.
 */
async function resolveClosure(value: unknown): Promise<unknown> {
  if (typeof value === 'function' && !isPropDescriptor(value)) {
    return await (value as () => unknown)();
  }

  return value;
}

/**
 * Shallow copy of `value` when it is a plain object or array, otherwise a fresh empty object.
 *
 * @param value Segment value to copy for writing.
 */
function copyForWrite(value: unknown): Container {
  if (Array.isArray(value)) {
    return [...value] as unknown as Container;
  }

  if (value !== null && typeof value === 'object' && !isPropDescriptor(value)) {
    const proto: unknown = Object.getPrototypeOf(value);

    if (proto === Object.prototype || proto === null) {
      return { ...(value as Container) };
    }
  }

  return {};
}

/**
 * Sets `value` at the dot-notation `key` inside `result`, resolving closures along the way.
 *
 * @param result Props object being built; written in place.
 * @param key Dot-notation key.
 * @param value Already-resolved value to set.
 */
async function setDotted(result: PageProps, key: string, value: unknown): Promise<void> {
  const segments = key.split('.');
  const last = segments.pop() as string;
  const target = await segments.reduce<Promise<Container>>(async (parentPromise, segment) => {
    const parent = await parentPromise;
    const next = copyForWrite(await resolveClosure(parent[segment]));

    parent[segment] = next;

    return next;
  }, Promise.resolve(result));

  target[last] = value;
}

/**
 * Unpacks top-level dot-notation keys into nested objects, like `Arr::set`.
 *
 * Bare functions along the intermediate segments, and at the dotted key itself, are called and
 * awaited first. Non-object segments are replaced by fresh objects. Prop descriptors are left as
 * values for the resolver. The input and the nested objects it holds are never mutated.
 *
 * @param props Page props that may contain dotted keys.
 */
export async function unpackDotProps(props: PageProps): Promise<PageProps> {
  const dottedKeys = Object.keys(props).filter((key) => key.includes('.'));

  return dottedKeys.reduce<Promise<PageProps>>(async (resultPromise, key) => {
    const result = await resultPromise;
    const value = await resolveClosure(props[key]);

    delete result[key];
    await setDotted(result, key, value);

    return result;
  }, Promise.resolve({ ...props }));
}

export default unpackDotProps;
