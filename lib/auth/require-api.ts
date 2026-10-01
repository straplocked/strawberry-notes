import { NextResponse } from 'next/server';
import { requireUserId } from './require';
import { verifyBearerToken, type TokenScope } from './token';

export type ApiAuth =
  | { ok: true; userId: string; via: 'bearer' | 'session'; scope: TokenScope }
  | { ok: false; response: NextResponse };

/**
 * Authenticate an API request. Prefers `Authorization: Bearer <token>`; falls
 * back to the browser session cookie. Used by routes that must accept both
 * browser clients (cookies) and programmatic clients (tokens).
 *
 * `scope` is the bearer token's own scope for `via: 'bearer'`, and always
 * `'write'` for `via: 'session'` — the browser session carries the user's
 * full account access regardless of token scopes (scope only limits what a
 * *token* can do, task 04 PR B).
 */
export async function requireUserIdForApi(req: Request): Promise<ApiAuth> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && /^Bearer\s+/i.test(header)) {
    const raw = header.replace(/^Bearer\s+/i, '').trim();
    const verified = await verifyBearerToken(raw);
    if (!verified) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
      };
    }
    return { ok: true, userId: verified.userId, via: 'bearer', scope: verified.scope };
  }
  const s = await requireUserId();
  if (!s.ok) return s;
  return { ok: true, userId: s.userId, via: 'session', scope: 'write' };
}

/**
 * Stricter variant: only accepts a bearer token. Use for endpoints that must
 * not be reachable by browser CSRF (e.g. the MCP endpoint).
 */
export async function requireBearerUserId(req: Request): Promise<ApiAuth> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header || !/^Bearer\s+/i.test(header)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'bearer token required' }, { status: 401 }),
    };
  }
  const raw = header.replace(/^Bearer\s+/i, '').trim();
  const verified = await verifyBearerToken(raw);
  if (!verified) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, userId: verified.userId, via: 'bearer', scope: verified.scope };
}
