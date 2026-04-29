import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_PING_TIMEOUT_MS = 1000;

/**
 * GET /api/health — public readiness probe.
 *
 * Pings Postgres with a bounded timeout. Returns 200 + `{ ok, db: 'up' }` when
 * the DB is reachable; 503 + `{ ok: false, db: 'down', error }` otherwise.
 *
 * Intentionally not auth-gated, not rate-limited, and surfaces no secrets —
 * Docker / reverse-proxy probes need to call this at cold start before any
 * cookie or token exists.
 */
export async function GET(): Promise<Response> {
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('db ping timeout')), DB_PING_TIMEOUT_MS),
      ),
    ]);
    return NextResponse.json({ ok: true, db: 'up' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, db: 'down', error: message }, { status: 503 });
  }
}
