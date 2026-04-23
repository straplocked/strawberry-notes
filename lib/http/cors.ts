/**
 * Minimal CORS helper for the small set of endpoints the browser extension
 * (and other programmatic cross-origin clients) reaches. The primary access
 * gate is the bearer token, but we still restrict `Access-Control-Allow-Origin`
 * to the two browser-extension schemes rather than reflecting arbitrary
 * origins — this keeps third-party web pages from reading responses even if a
 * bearer token ever leaks to the wrong place.
 *
 * Only wire this into routes that explicitly need cross-origin access
 * (e.g. `/api/folders` GET, `/api/notes/import`). Do NOT apply it blanket.
 */

import { NextResponse } from 'next/server';

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type';
const ALLOWED_ORIGIN_RE = /^(chrome-extension|moz-extension|safari-web-extension):\/\/[a-z0-9-]+\/?$/;

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = ALLOWED_ORIGIN_RE.test(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowed,
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
