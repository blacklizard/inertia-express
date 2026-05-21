import type { VersionResolver } from './types.js';

/**
 * Resolve a version value (string, async function, or null) against a request.
 *
 * Returns `null` when no version is configured — in which case asset version
 * mismatch detection is disabled.
 *
 * @param resolver Static version string, a (possibly async) function, or undefined.
 * @param req Request passed to the resolver when it is a function.
 */
export async function resolveVersion<TReq>(
  resolver: VersionResolver<TReq> | undefined,
  req: TReq,
): Promise<string | null> {
  if (resolver === undefined || resolver === null) {
    return null;
  }

  if (typeof resolver === 'string') {
    return resolver;
  }

  const result = await (resolver)(req);

  return result ?? null;
}

/**
 * Returns true if the client's version (`X-Inertia-Version`) does not match
 * the server's current version. Mismatches on GET requests should trigger a
 * full reload via the `X-Inertia-Location` mechanism.
 *
 * @param serverVersion Currently configured server version; `null` disables checks.
 * @param clientVersion Value of the `X-Inertia-Version` header; `null` is treated as empty.
 */
export function isVersionMismatch(serverVersion: string | null, clientVersion: string | null): boolean {
  if (serverVersion === null) {
    return false;
  }

  // A missing client header is treated as an empty version, matching the
  // official adapters: an empty client version still mismatches a non-empty
  // server version and must trigger a full reload.
  return serverVersion !== (clientVersion ?? '');
}
