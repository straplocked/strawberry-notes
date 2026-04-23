/**
 * Minimal CORS helper for the small set of endpoints the browser extension
 * (and other programmatic cross-origin clients) reaches. Intentionally
 * permissive on `Origin` because the access gate is the bearer token, not
 * the origin — tokens are user-issued and revocable.
 *
 * We reflect the caller's origin rather than using `*` so that responses
 * may still carry credentials-like semantics cleanly; callers should send
 * `Authorization: Bearer <token>` (no cookies).
 *
 * Only wire this into routes that explicitly need cross-origin access
 * (e.g. `/api/folders` GET, `/api/notes/import`). Do NOT apply it blanket.
 */

import { NextResponse } from 'next/server';

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type';

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** Apply CORS headers to an existing response, returning the same response. */
export function withCors(req: Request, res: NextResponse): NextResponse {
  const h = corsHeaders(req);
  for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
  return res;
}

/** Standard preflight handler. */
export function preflight(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}
