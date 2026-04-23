import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/require';
import { listBacklinks } from '@/lib/notes/link-service';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const rows = await listBacklinks(a.userId, id);
  return NextResponse.json(rows);
}
