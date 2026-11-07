import type { Request, Response } from 'express';

/**
 * Whether an `end()` chunk argument carries no body bytes.
 *
 * @param chunk The first argument given to `res.end`.
 */
function isEmptyChunk(chunk: unknown): boolean {
  return chunk === undefined
    || chunk === null
    || typeof chunk === 'function'
    || chunk === ''
    || (chunk instanceof Uint8Array && chunk.length === 0);
}

/**
 * Redirect back when an Inertia request ends with an empty 200.
 *
 * Mirrors inertia-laravel `Middleware::onEmptyResponse`: if the handler ends
 * the response with status 200 and no body (nothing written, headers not yet
 * sent), the response becomes `res.redirect(302, Referer ?? '/')`, which goes
 * through the patched `res.redirect` and so is promoted to 303 after
 * PUT/PATCH/DELETE/QUERY.
 *
 * Limitation: the guard is not observed when headers were already sent
 * (`res.flushHeaders()`, streaming) or when the handler never responds.
 *
 * @param req The Express request; supplies the `Referer` header.
 * @param res The Express response whose `write` and `end` are wrapped.
 */
export default function installEmptyResponseGuard(req: Request, res: Response): void {
  const originalWrite = res.write;
  const originalEnd = res.end;
  let written = false;

  res.write = function write(this: Response, ...args: unknown[]) {
    written = true;

    return (originalWrite as (...a: unknown[]) => boolean).apply(this, args);
  } as typeof res.write;

  res.end = function end(this: Response, chunk?: unknown, ...rest: unknown[]) {
    if (res.statusCode === 200 && !res.headersSent && !written && isEmptyChunk(chunk)) {
      // Express's redirect ends the response through `res.end`.
      res.end = originalEnd;

      if (typeof chunk === 'function') {
        res.once('finish', chunk as () => void);
      }

      res.redirect(302, req.get('Referer') ?? '/');

      return this;
    }

    return (originalEnd as (...a: unknown[]) => Response).call(this, chunk, ...rest);
  } as typeof res.end;
}
