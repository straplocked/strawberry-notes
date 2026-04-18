import { NextResponse } from 'next/server';
import { auth } from '../auth';

/** Returns the session user id, or a 401 JSON response. */
export async function requireUserId(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  return { ok: true, userId };
}
