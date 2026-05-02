import { NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/auth/require';
import { resetPasswordById } from '@/lib/auth/user-admin';
import { errorResponse } from '../../route';

/** POST /api/admin/users/:id/reset-password — generate + return a new password
 * (one-time view; the caller copies it out-of-band to the user). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAdminUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  try {
    const result = await resetPasswordById(id);
    return NextResponse.json({ password: result.password, generated: result.generated });
  } catch (err) {
    return errorResponse(err);
  }
}
