/**
 * Resolve the public base URL for outbound links (e.g. email links).
 *
 * Priority:
 *   1. `AUTH_URL` env var, if set — production behind a proxy where the
 *      operator has pinned the canonical URL (and Auth.js itself relies
 *      on it for callbacks).
 *   2. `X-Forwarded-Host` (with `X-Forwarded-Proto`) — proxy that's
 *      forwarding the original host without an env override.
 *   3. The `Host` header on the incoming request — direct LAN/dev access
 *      via IP or hostname.
 *   4. Final fallback: `http://localhost:3200`.
 *
 * Trailing slashes are stripped; callers append their own paths.
 */
export function getPublicBaseUrl(
  req?: Request | { headers: Headers; url?: string },
): string {
  const env = process.env.AUTH_URL?.trim();
  if (env) return env.replace(/\/+$/, '');

  if (req) {
    const headers = req.headers;
    const fwdHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const fwdProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    if (fwdHost) {
      // Proxy in front: TLS termination is the common case, so assume
      // https unless the proxy told us otherwise.
      return `${fwdProto || 'https'}://${fwdHost}`;
    }
    const host = headers.get('host')?.trim();
    if (host) {
      let proto = fwdProto;
      if (!proto && 'url' in req && req.url) {
        try {
          proto = new URL(req.url).protocol.replace(/:$/, '');
        } catch {
          // Malformed url — ignore and fall through to http default.
        }
      }
      return `${proto || 'http'}://${host}`;
    }
  }

  return 'http://localhost:3200';
}
