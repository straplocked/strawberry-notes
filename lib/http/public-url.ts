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

/**
 * Whether the *actual* inbound request arrived over HTTPS. Use this to decide
 * a cookie's `Secure` attribute — it must match the real transport, not
 * `NODE_ENV` and not the canonical `AUTH_URL`. A `Secure` cookie set over
 * plain HTTP is silently dropped by the browser, which is exactly what breaks
 * the TOTP flow on LAN/HTTP self-hosted instances.
 *
 * Mirrors how Auth.js derives `useSecureCookies` from the request. Defaults to
 * `false` (non-secure) when the proto can't be determined, so cookies are
 * never lost on a legitimate HTTP origin.
 */
export function isSecureRequest(
  input?: Request | { headers: Headers; url?: string } | Headers | null,
): boolean {
  if (!input) return false;
  // Accept a bare Headers (e.g. `await headers()` in a route/authorize) or a
  // Request-like carrying its own headers + url.
  const headers = 'get' in input ? (input as Headers) : input.headers;
  const url = 'url' in input ? input.url : undefined;
  const fwdProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (fwdProto) return fwdProto === 'https';
  if (url) {
    try {
      return new URL(url).protocol === 'https:';
    } catch {
      // Malformed url — fall through to the non-secure default.
    }
  }
  return false;
}
