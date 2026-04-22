import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/require';
import { listTags } from '@/lib/notes/tag-service';

export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const out = await listTags(a.userId);
  return NextResponse.json(out);
}
