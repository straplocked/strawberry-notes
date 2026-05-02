import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { listOidcAccountsForUser } from '@/lib/auth/oidc-link';
import {
  getOidcLabel,
  isOidcEnabled,
  isProxyAuthEnabled,
  isTotpEnabled,
} from '@/lib/auth/mode';

/** GET /api/auth/security/status — flags + per-user enrollment state for
 * the Security section in /settings. */
export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const [user] = await db
    .select({
      totpEnrolledAt: users.totpEnrolledAt,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, a.userId));
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const oidcAccounts = isOidcEnabled() ? await listOidcAccountsForUser(a.userId) : [];

  return NextResponse.json({
    totp: {
      enabled: isTotpEnabled(),
      enrolled: !!user.totpEnrolledAt,
      enrolledAt: user.totpEnrolledAt ? user.totpEnrolledAt.toISOString() : null,
    },
    oidc: {
      enabled: isOidcEnabled(),
      label: getOidcLabel(),
      accounts: oidcAccounts,
    },
    proxyMode: isProxyAuthEnabled(),
    hasPassword: !!user.passwordHash,
  });
}
