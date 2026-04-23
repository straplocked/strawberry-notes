import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/require';
import { gcOrphanAttachments } from '@/lib/notes/gc';

export const runtime = 'nodejs';

/**
 * POST /api/attachments/gc
 *
 * Delete attachments (files + rows) whose note is gone or was never attached.
 * Safe to run on demand by the operator; scoped to the signed-in user.
 *
 * Response: `{ removedFiles, removedRows, freedBytes }`.
 */
export async function POST(): Promise<Response> {
  const a = await requireUserId();
  if (!a.ok) return a.response;

  const result = await gcOrphanAttachments(a.userId);
  return NextResponse.json(result);
}
