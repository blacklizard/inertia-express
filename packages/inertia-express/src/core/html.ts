import type { InertiaPage } from './types.js';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape characters that would break out of a double-quoted HTML attribute.
 *
 * @param value Raw attribute value.
 */
function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/**
 * Encode an Inertia page object for embedding inside a
 * `<script type="application/json" data-page="...">` tag — the Inertia v3
 * initial-page transport that the client reads via `getInitialPageFromDOM`.
 *
 * Every `<` is replaced with its JSON unicode escape so the payload cannot
 * terminate the surrounding `</script>` element or open an HTML comment. The
 * escape is transparent — JSON.parse decodes it back to `<`.
 *
 * @param page Resolved Inertia page object.
 */
export function encodePageScript(page: InertiaPage): string {
  return JSON.stringify(page).replace(/</g, '\\u003C');
}

/**
 * Inputs to {@link renderDefaultHtml}.
 */
export interface DefaultRootViewInput {
  page: InertiaPage;
  /** Optional `<title>` for the document. */
  title?: string;
  /** Optional <head> content (meta tags, links, etc.). */
  head?: string;
  /** ID of the SPA root element. Defaults to `app`. */
  rootId?: string;
  /** Path to the client entry script, e.g. `/assets/app.js`. */
  scriptSrc?: string;
  /**
   * Pre-rendered SSR HTML for the root element's *inner* content. When set,
   * the inner HTML of the root div is replaced with this string so the
   * client hydrates over server-rendered markup.
   */
  ssrBody?: string;
  /**
   * Pre-rendered SSR HTML representing the entire root element. When set,
   * `ssrBody`, `rootId`, and the page `<script>` tag are ignored — the
   * provided string is inserted into `<body>` as-is. Use this when your
   * SSR renderer already returns the full root element + page script (the
   * Inertia v3 SSR servers do).
   */
  ssrFull?: string;
}

/**
 * Minimal default HTML shell for use when no custom root view is provided.
 * Real apps should plug in a template engine (pug, ejs, react-dom/server,
 * etc.) and embed `encodePageScript(page)` themselves.
 *
 * The initial page object is emitted as a
 * `<script type="application/json" data-page="...">` tag, the Inertia v3
 * transport that the client reads on boot.
 *
 * @param input Page object plus optional title/head/rootId/scriptSrc/SSR markup
 *   — see {@link DefaultRootViewInput}.
 */
export function renderDefaultHtml(input: DefaultRootViewInput): string {
  const rootId = input.rootId ?? 'app';
  const title = input.title ?? 'Inertia App';
  const head = input.head ?? '';
  const script = input.scriptSrc ? `<script type="module" src="${escapeHtmlAttribute(input.scriptSrc)}"></script>` : '';

  let rootMarkup: string;

  if (input.ssrFull) {
    rootMarkup = input.ssrFull;
  } else {
    const idAttr = escapeHtmlAttribute(rootId);
    const inner = input.ssrBody ?? '';
    const pageScript = `<script data-page="${idAttr}" type="application/json">${encodePageScript(input.page)}</script>`;
    rootMarkup = `<div id="${idAttr}">${inner}</div>\n    ${pageScript}`;
  }

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtmlAttribute(title)}</title>
    ${head}
  </head>
  <body>
    ${rootMarkup}
    ${script}
  </body>
</html>`;
}
