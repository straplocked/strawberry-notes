import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/require';
import { revokeToken } from '@/lib/auth/token';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const ok = await revokeToken(a.userId, id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
