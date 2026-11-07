/**
 * `true` when `path` equals `parent` or lies in its dot-notation subtree.
 *
 * @param path Dot-notation prop path to test.
 * @param parent Dot-notation path that may contain `path`.
 */
export function pathIsSameOrDescendant(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}.`);
}

/**
 * `true` when `path` matches an `only` entry or is a descendant of one.
 *
 * @param path Dot-notation prop path to test.
 * @param only Requested partial-reload `only` paths.
 */
export function matchesOnly(path: string, only: string[]): boolean {
  return only.some((onlyPath) => pathIsSameOrDescendant(path, onlyPath));
}

/**
 * `true` when `path` is a strict ancestor of an `only` entry.
 *
 * @param path Dot-notation prop path to test.
 * @param only Requested partial-reload `only` paths.
 */
export function leadsToOnly(path: string, only: string[]): boolean {
  return only.some((onlyPath) => onlyPath.startsWith(`${path}.`));
}

/**
 * `true` when `path` matches an `except` entry or is a descendant of one.
 *
 * @param path Dot-notation prop path to test.
 * @param except Requested partial-reload `except` paths.
 */
export function matchesExcept(path: string, except: string[]): boolean {
  return except.some((exceptPath) => pathIsSameOrDescendant(path, exceptPath));
}
