/**
 * Proxy / forward-auth mode. When `PROXY_AUTH=on`, Strawberry's own auth
 * is bypassed and the app trusts a configured username header injected by
 * an upstream SSO proxy (Authentik forward-auth, Authelia, oauth2-proxy).
 *
 * Trust model:
 *   - The operator MUST set `PROXY_AUTH_SHARED_SECRET` and configure their
 *     proxy to forward `X-Forward-Auth-Secret: <secret>` on every request.
 *   - Any request without the secret is rejected — even if it carries the
 *     username header. This guards against a misconfigured proxy that
 *     forgets to strip client-supplied versions of the username header.
 *   - JWT cookies from a previous (non-proxy) auth mode are intentionally
 *     ignored when proxy mode is on. The header is the only source of
 *     truth.
 *
 * (PROXY_AUTH_TRUSTED_IPS is reserved for a future iteration where we read
 * the TCP peer address directly. For now, shared-secret is required.)
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import type { UserRole } from '../auth';
import { ensureAdminBootstrap } from './bootstrap';
import { getProxySharedSecret, getProxyUserHeader } from './mode';
import { seedFirstRunContent } from './first-run';

export const PROXY_SECRET_HEADER = 'x-forward-auth-secret';

export interface ProxyTrustHeaders {
  get(name: string): string | null;
}

/** Returns true iff the configured shared secret is present in the headers. */
export function isProxyRequestTrusted(headers: ProxyTrustHeaders): boolean {
  const expected = getProxySharedSecret();
  if (!expected) return false;
  const got = headers.get(PROXY_SECRET_HEADER);
  if (!got) return false;
  // Constant-time compare; if lengths differ, fail without leaking via early
  // return time.
  return constantTimeEqual(got, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

interface CacheEntry {
  userId: string;
  role: UserRole;
  email: string;
  disabledAt: Date | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, CacheEntry>();

export function clearProxyUserCache(): void {
  cache.clear();
}

export interface ProxyUserResult {
  userId: string;
  role: UserRole;
  email: string;
  disabledAt: Date | null;
}

/** Look up (or just-in-time create) a local user from the proxy username
 * header. The username should be the IdP's stable identifier — typically
 * email-shaped, but anything unique works. We lower-case before lookup. */
export async function getOrJitProvisionUser(
  rawUsername: string,
  rawEmail: string | null,
): Promise<ProxyUserResult | null> {
  const username = rawUsername.trim().toLowerCase();
  if (!username) return null;

  const now = Date.now();
  const cached = cache.get(username);
  if (cached && cached.expiresAt > now) {
    return {
      userId: cached.userId,
      role: cached.role,
      email: cached.email,
      disabledAt: cached.disabledAt,
    };
  }

  // Use email if it looks like one; otherwise treat the username as the
  // email-shaped identifier (Authentik often passes a UPN). Strawberry's
  // users table requires a unique email column, so we have to put *something*
  // there.
  const email = (rawEmail ?? '').trim().toLowerCase() || username;

  const [existing] = await db
    .select({
      id: users.id,
      role: users.role,
      email: users.email,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.email, email));

  if (existing) {
    cache.set(username, {
      userId: existing.id,
      role: existing.role as UserRole,
      email: existing.email,
      disabledAt: existing.disabledAt,
      expiresAt: now + CACHE_TTL_MS,
    });
    return {
      userId: existing.id,
      role: existing.role as UserRole,
      email: existing.email,
      disabledAt: existing.disabledAt,
    };
  }

  // JIT provision — passwordHash null, pre-confirmed (the proxy vouches).
  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash: null,
      emailConfirmedAt: new Date(),
    })
    .returning({ id: users.id, email: users.email });

  // First-run content + admin bootstrap, mirroring signup + OIDC paths.
  try {
    await seedFirstRunContent(created.id);
  } catch {}
  const role = await ensureAdminBootstrap(created.id);

  cache.set(username, {
    userId: created.id,
    role,
    email: created.email,
    disabledAt: null,
    expiresAt: now + CACHE_TTL_MS,
  });

  return { userId: created.id, role, email: created.email, disabledAt: null };
}

/** Read the username header from a Headers-like object. */
export function readProxyUsername(headers: ProxyTrustHeaders): string | null {
  return headers.get(getProxyUserHeader());
}

export const __TEST = { CACHE_TTL_MS, cache };
