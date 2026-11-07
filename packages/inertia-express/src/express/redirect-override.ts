import { INERTIA_HEADERS, inertiaRedirectStatus } from '../core/index.js';

import type { Request, Response } from 'express';

/**
 * Replace `res.redirect` for the current Inertia response.
 *
 * Mirrors inertia-laravel: a 302 after PUT/PATCH/DELETE/QUERY is promoted to
 * 303, and a redirect whose URL contains a `#` fragment is answered with an
 * empty 409 plus `X-Inertia-Redirect` (browsers drop fragments on XHR
 * redirects) unless the request is a prefetch.
 *
 * @param req The Express request; supplies the method and `req.inertia.isPrefetch`.
 * @param res The Express response whose `redirect` is replaced.
 */
export default function installRedirectOverride(req: Request, res: Response): void {
  const originalRedirect = res.redirect.bind(res);

  // Express's `res.redirect` signature is either (url) or (status, url) —
  // handle both. The deprecated (url, status) form was removed in v5.
  res.redirect = ((arg1: number | string, arg2?: string | number) => {
    let status: number;
    let url: string;

    if (typeof arg1 === 'number') {
      status = arg1;
      url = String(arg2);
    } else {
      status = 302;
      url = arg1;
    }

    if (status === 302) {
      status = inertiaRedirectStatus(req.method, 302);
    }

    if (url.includes('#') && !req.inertia?.isPrefetch) {
      res.status(409).setHeader(INERTIA_HEADERS.redirect, url).end();

      return;
    }

    originalRedirect(status, url);
  });
}
