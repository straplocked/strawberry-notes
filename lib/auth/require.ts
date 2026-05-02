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

/** Returns the session user id when the caller is an admin, or a 401 / 403
 * JSON response. Use for `/api/admin/*` routes and `/admin/*` server pages. */
export async function requireAdminUserId(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (session?.user?.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId };
}
