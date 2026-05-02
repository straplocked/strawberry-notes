import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { deleteUser, setUserDisabled, setUserRole } from '@/lib/auth/user-admin';
import { errorResponse } from '../route';

const PatchBody = z.object({
  role: z.enum(['user', 'admin']).optional(),
  disabled: z.boolean().optional(),
});

/** PATCH /api/admin/users/:id — change role and/or disabled status. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAdminUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;

  const raw = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  // The acting admin can't disable / demote themselves — we'd lock them out.
  if (id === a.userId && (parsed.data.disabled === true || parsed.data.role === 'user')) {
    return NextResponse.json(
      { error: 'self_action', message: 'cannot disable or demote yourself' },
      { status: 403 },
    );
  }

  try {
    if (parsed.data.role !== undefined) {
      const target = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, id));
      if (target.length === 0) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      await setUserRole(target[0].email, parsed.data.role);
    }
    if (parsed.data.disabled !== undefined) {
      await setUserDisabled(id, parsed.data.disabled);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/admin/users/:id — hard delete (cascades). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAdminUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  try {
    await deleteUser(id, { actingUserId: a.userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
