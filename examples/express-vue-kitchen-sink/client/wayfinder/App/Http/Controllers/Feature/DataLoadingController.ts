// Compatibility shim for the DataLoading feature controller.

/** Once-props demo route — `.url` is the page path Inertia <Link> consumes. */
export function onceProps(page: number | string = 1): {
  url: string;
  method: "get";
} {
  return { url: `/features/data-loading/once-props/${page}`, method: "get" };
}
