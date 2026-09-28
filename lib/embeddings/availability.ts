/**
 * Runtime detection of whether pgvector's `notes.content_embedding` column
 * actually exists on the connected database.
 *
 * `drizzle/0005_embeddings.sql` only creates this column when the `vector`
 * extension is available on the server (see that file's DO-block guard) —
 * on a shared Postgres without pgvector, the column is simply absent. The
 * app must still boot and behave sanely in that case: the embedding worker
 * stays idle and semantic search falls back to full-text search, instead of
 * every query blowing up with "column does not exist".
 *
 * The check runs once (a single `information_schema` query) and is cached
 * for the lifetime of the process — every call after the first is a memory
 * read. `instrumentation.ts` warms this cache at server boot and logs the
 * result; callers that run before boot warm-up completes (or in a request
 * that races it) simply trigger the same check lazily and get the same
 * cached answer afterward.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client';

let cachedAvailable: boolean | null = null;
let loggedUnavailable = false;

async function checkEmbeddingColumn(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'notes'
        AND column_name = 'content_embedding'
      LIMIT 1
    `);
    const rows = (result as unknown as { rows?: unknown[] } | undefined)?.rows;
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    // A broken/unreachable DB shouldn't crash the caller — treat it the same
    // as "not available" and let the normal DB-connectivity error paths
    // (health checks, migrations) surface the real problem.
    console.error(
      '[embeddings] pgvector availability check failed; assuming unavailable',
      err,
    );
    return false;
  }
}

/**
 * True when `notes.content_embedding` exists (i.e. pgvector was available
 * when migrations ran). Cached after the first call.
 */
export async function isEmbeddingColumnAvailable(): Promise<boolean> {
  if (cachedAvailable !== null) return cachedAvailable;
  cachedAvailable = await checkEmbeddingColumn();
  if (!cachedAvailable && !loggedUnavailable) {
    // Single clear boot-time line — see instrumentation.ts. Guarded so a
    // busy server doesn't repeat it (the cache normally prevents re-entry
    // anyway, but a failed check leaves `cachedAvailable` as `false`, not
    // `null`, so this guard is what actually prevents log spam on repeated
    // calls after a successful "unavailable" determination).
    console.info('[embeddings] pgvector not available: semantic search disabled');
    loggedUnavailable = true;
  }
  return cachedAvailable;
}

/** Test-only: clear the memoized result so a test can flip DB state and recheck. */
export function __resetEmbeddingAvailabilityForTests(): void {
  cachedAvailable = null;
  loggedUnavailable = false;
}

/** Test-only: force the cached result without touching the DB. */
export function __setEmbeddingAvailableForTests(value: boolean): void {
  cachedAvailable = value;
}
