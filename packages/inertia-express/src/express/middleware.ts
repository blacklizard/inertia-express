import { format } from 'node:util';

import { sendInertiaLocation, sendInertiaResponse } from './response.js';
import {
  inertiaRedirectStatus, parseInertiaRequest, renderErrorPage, scopeErrors,
} from '../core/index.js';

import type { NextFunction, Request, Response } from 'express';

import type { InertiaMiddlewareOptions, InertiaResponseOptions } from './types.js';
import type { PageProps, ValidationErrors } from '../core/index.js';

/**
 * Build the `connect-flash`-compatible `req.flash()` method for a request.
 * Provided so this package is a drop-in replacement for `connect-flash`: the
 * returned function matches its semantics exactly — a setter call appends to
 * a per-type bucket in `req.session.flash` and returns the new bucket length,
 * a getter call reads and clears. Throws when no session is wired, just like
 * `connect-flash`.
 *
 * @param req Express request whose `session` holds the flash buckets.
 */
function createFlash(req: Request): Request['flash'] {
  return ((type?: string, msg?: unknown, ...rest: unknown[]): number | string[] | Record<string, string[]> => {
    const { session } = (req as unknown as { session?: Record<string, unknown> });

    if (session === undefined) {
      throw new Error('req.flash() requires sessions');
    }

    const msgs = (session.flash as Record<string, string[]> | undefined) ?? {};
    session.flash = msgs;

    // Setter: `req.flash(type, msg)` appends and returns the new count.
    if (type && msg) {
      let bucket = msgs[type];

      if (bucket === undefined) {
        bucket = [];
        msgs[type] = bucket;
      }

      if (rest.length > 0) {
        // util.format interpolation: req.flash('info', 'Hello %s', name).
        return bucket.push(format(msg, ...rest));
      }

      if (Array.isArray(msg)) {
        msg.forEach((val) => bucket.push(val as string));

        return bucket.length;
      }

      return bucket.push(msg as string);
    }

    // Getter: `req.flash(type)` returns and clears that one bucket.
    if (type) {
      const arr = msgs[type] ?? [];
      delete msgs[type];

      return arr;
    }

    // Getter: `req.flash()` returns and clears every bucket.
    session.flash = {};

    return msgs;
  }) as Request['flash'];
}

/**
 * Create the Inertia.js Express middleware.
 *
 * The middleware:
 *   - Parses Inertia headers into `req.inertia`.
 *   - Adds `req.flash(type?, msg?)` — a `connect-flash`-compatible API.
 *   - Adds `res.inertia(component, props, options)`.
 *   - Adds `res.inertiaLocation(url)` for external redirects.
 *   - Adds `res.inertiaErrors(errors, bag?)` to flash validation errors.
 *   - Adds `res.inertiaFlash(data)` to flash arbitrary data.
 *   - Adds `res.inertiaError(status, message?)` to render an error page.
 *   - Auto-promotes redirects after PUT/PATCH/DELETE to 303 for Inertia visits.
 *
 * Mount before your route handlers:
 *
 * ```ts
 * app.use(inertia({ rootView: ..., sharedProps: ... }));
 * ```
 *
 * @param options Middleware configuration; defaults to an empty object.
 */
export function inertia(options: InertiaMiddlewareOptions = {}) {
  const ctx = { options };

  return function inertiaMiddleware(req: Request, res: Response, next: NextFunction): void {
    const info = parseInertiaRequest({
      headers: req.headers,
      method: req.method,
      url: req.originalUrl ?? req.url,
    });
    req.inertia = info;

    // req.flash() — connect-flash compatible. See createFlash above.
    req.flash = createFlash(req);

    // res.inertia() — the main render helper.
    res.inertia = async (
      component: string,
      props: PageProps = {},
      opts: InertiaResponseOptions = {},
    ): Promise<void> => {
      try {
        await sendInertiaResponse(req, res, ctx, component, props, opts);
      } catch (err) {
        next(err);
      }
    };

    // res.inertiaLocation() — external redirect.
    res.inertiaLocation = (url: string): void => {
      sendInertiaLocation(req, res, url);
    };

    // res.inertiaErrors() — stash validation errors for the next request.
    // No-ops gracefully when no session is configured.
    res.inertiaErrors = (errors: ValidationErrors, bag?: string): void => {
      const { session } = (req as unknown as { session?: Record<string, unknown> });
      const scoped = scopeErrors(errors, bag ?? null);

      if (session) {
        const existing = (session.errors as PageProps | undefined) ?? {};
        session.errors = { ...existing, ...(scoped.errors as PageProps) };
      } else {
        // Without a session, expose them on res.locals so a custom shared-prop
        // resolver can pick them up for the same response.
        res.locals.inertiaErrors = scoped.errors;
      }
    };

    // res.inertiaFlash() — stash flash data for the next request.
    // No-ops gracefully when no session is configured.
    res.inertiaFlash = (data: Record<string, unknown>): void => {
      const { session } = (req as unknown as { session?: Record<string, unknown> });

      if (session) {
        session.flash = data;
      }
    };

    // res.inertiaError() — render an error page at the given HTTP status.
    // Inertia requests render the client `Error` component (status passed as a
    // prop); on a render/SSR failure, or for plain browser loads, it falls back
    // to a standalone HTML page so the user never sees a raw JSON error.
    res.inertiaError = async (status: number, message?: string): Promise<void> => {
      res.status(status);

      if (req.inertia?.isInertia) {
        try {
          await sendInertiaResponse(req, res, ctx, 'Error', { status }, {});

          return;
        } catch {
          // Error component unresolved or SSR failed — fall through to the
          // standalone HTML fallback below.
        }
      }

      if (!res.headersSent) {
        res.status(status).type('html').send(renderErrorPage({ status, message }));
      }
    };

    // Promote redirects after PUT/PATCH/DELETE to 303 so the follow-up GET
    // is correctly issued by every browser.
    if (info.isInertia) {
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
          status = inertiaRedirectStatus(req.method, 302);
          url = arg1;
        }

        // If the user explicitly passed a 302 from a non-GET, bump to 303.
        if (status === 302 && (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')) {
          status = 303;
        }

        originalRedirect(status, url);
      });
    }

    // Make sure CDNs / shared caches don't mix Inertia JSON and HTML variants.
    const existingVary = res.getHeader('Vary');

    if (!existingVary) {
      res.setHeader('Vary', 'Accept, X-Inertia');
    }

    next();
  };
}

export default inertia;
