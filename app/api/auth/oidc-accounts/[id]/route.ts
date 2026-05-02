import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { oidcAccounts, users } from '@/lib/db/schema';

/** DELETE /api/auth/oidc-accounts/:id — unlink an OIDC account from the
 * caller. Refuses if the user has no password — would lock them out
 * unless proxy mode is on. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, a.userId));
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // If this is the only credential the user has, refuse — unlinking would
  // lock them out of their own account.
  const remainingLinks = await db
    .select({ id: oidcAccounts.id })
    .from(oidcAccounts)
    .where(eq(oidcAccounts.userId, a.userId));

  const willHaveCredentials =
    !!user.passwordHash || remainingLinks.filter((r) => r.id !== id).length > 0;
  if (!willHaveCredentials) {
    return NextResponse.json(
      { error: 'last_credential', message: 'set a password before unlinking your only sign-in method' },
      { status: 409 },
    );
  }

  const rows = await db
    .delete(oidcAccounts)
    .where(and(eq(oidcAccounts.id, id), eq(oidcAccounts.userId, a.userId)))
    .returning({ id: oidcAccounts.id });

  if (rows.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
