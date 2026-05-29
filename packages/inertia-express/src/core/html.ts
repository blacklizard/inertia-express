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

/** Default user-facing messages keyed by HTTP status, used when none is given. */
const ERROR_STATUS_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Page Not Found',
  409: 'Conflict',
  419: 'Page Expired',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/**
 * Inputs to {@link renderErrorPage}.
 */
export interface ErrorPageInput {
  /** HTTP status code to surface to the user. */
  status: number;
  /** Optional message; falls back to a default for the status, then a generic line. */
  message?: string;
}

/**
 * Render a minimal, SPA-less standalone HTML error page. Used as the hard
 * fallback when no client `Error` component can be resolved (e.g. a plain
 * browser load, or an SSR/render failure on the Inertia path), so a user
 * never receives a raw JSON error or a blank page.
 *
 * @param input HTTP status plus an optional override message — see {@link ErrorPageInput}.
 */
export function renderErrorPage(input: ErrorPageInput): string {
  const { status } = input;
  const message = input.message ?? ERROR_STATUS_MESSAGES[status] ?? 'Something went wrong';
  const safeStatus = escapeHtmlAttribute(String(status));
  const safeMessage = escapeHtmlAttribute(message);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeStatus} ${safeMessage}</title>
    <style>
      body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8f9fa; color: #212529; }
      main { text-align: center; padding: 2rem; }
      h1 { font-size: 4rem; margin: 0; font-weight: 600; }
      p { font-size: 1.25rem; margin: 0.5rem 0 0; color: #6c757d; }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeStatus}</h1>
      <p>${safeMessage}</p>
    </main>
  </body>
</html>`;
}
