import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '../auth';
import type { UserRole } from '../auth';
import { getProxyEmailHeader, isProxyAuthEnabled } from './mode';
import { getOrJitProvisionUser, isProxyRequestTrusted, readProxyUsername } from './proxy';

export interface EffectiveSession {
  user: { id: string; email: string; role: UserRole };
}

/** Resolve the current request's session, accounting for proxy mode.
 *
 * In proxy mode, the JWT cookie is intentionally ignored — the trusted
 * forward-auth header is the only source of truth. Otherwise this delegates
 * to Auth.js's `auth()`. */
export async function getEffectiveSession(): Promise<EffectiveSession | null> {
  if (isProxyAuthEnabled()) {
    const h = await headers();
    if (!isProxyRequestTrusted(h)) return null;
    const username = readProxyUsername(h);
    if (!username) return null;
    const headerEmail = h.get(getProxyEmailHeader());
    const user = await getOrJitProvisionUser(username, headerEmail);
    if (!user || user.disabledAt) return null;
    return { user: { id: user.userId, email: user.email, role: user.role } };
  }
  const s = await auth();
  if (!s?.user?.id || !s.user.email) return null;
  return {
    user: {
      id: s.user.id,
      email: s.user.email,
      role: (s.user.role as UserRole) ?? 'user',
    },
  };
}

/** Returns the session user id, or a 401 JSON response. */
export async function requireUserId(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await getEffectiveSession();
  const userId = session?.user.id;
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  return { ok: true, userId };
}

/** Returns the session user id when the caller is an admin, or a 401 / 403
 * JSON response. Use for `/api/admin/*` routes and `/admin/*` server pages. */
export async function requireAdminUserId(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await getEffectiveSession();
  const userId = session?.user.id;
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (session?.user.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId };
}
