import { NextResponse } from 'next/server';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/require';
import { db } from '@/lib/db/client';
import { folders, notes } from '@/lib/db/schema';
import type { FolderDTO } from '@/lib/types';

export async function GET() {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const rows = await db
    .select({
      id: folders.id,
      name: folders.name,
      color: folders.color,
      position: folders.position,
      count: sql<number>`coalesce(count(${notes.id})::int, 0)`,
    })
    .from(folders)
    .leftJoin(
      notes,
      and(eq(notes.folderId, folders.id), isNull(notes.trashedAt), eq(notes.userId, a.userId)),
    )
    .where(eq(folders.userId, a.userId))
    .groupBy(folders.id)
    .orderBy(asc(folders.position), asc(folders.name));

  const out: FolderDTO[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    count: Number(r.count ?? 0),
  }));
  return NextResponse.json(out);
}

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#e33d4e'),
});

export async function POST(req: Request) {
  const a = await requireUserId();
  if (!a.ok) return a.response;
  const raw = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const [maxPos] = await db
    .select({ max: sql<number>`coalesce(max(${folders.position}), -1)::int` })
    .from(folders)
    .where(eq(folders.userId, a.userId));

  const [f] = await db
    .insert(folders)
    .values({
      userId: a.userId,
      name: parsed.data.name,
      color: parsed.data.color,
      position: Number(maxPos?.max ?? -1) + 1,
    })
    .returning();

  return NextResponse.json({
    id: f.id,
    name: f.name,
    color: f.color,
    position: f.position,
    count: 0,
  } satisfies FolderDTO);
}
