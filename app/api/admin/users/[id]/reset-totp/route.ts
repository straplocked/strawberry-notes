import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdminUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

/** POST /api/admin/users/:id/reset-totp — clear a user's TOTP enrollment.
 * Used when a user has lost both their authenticator and recovery codes. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAdminUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;

  const rows = await db
    .update(users)
    .set({
      totpSecret: null,
      totpEnrolledAt: null,
      totpRecoveryCodes: null,
    })
    .where(eq(users.id, id))
    .returning({ id: users.id });

  if (rows.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
