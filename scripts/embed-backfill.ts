/**
 * Walk every non-trashed note with `embedding_stale = true` and embed it.
 *
 * Idempotent: run it any time to catch up. Safe to run while the app is live;
 * it uses the same `SELECT ... FOR UPDATE SKIP LOCKED` batch puller as the
 * in-process worker, so concurrent replicas / workers cooperate.
 *
 * Usage:
 *   EMBEDDING_ENDPOINT=... EMBEDDING_MODEL=... EMBEDDING_DIMS=... \
 *   EMBEDDING_API_KEY=... DATABASE_URL=... npm run db:embed
 */

import { sql } from 'drizzle-orm';
import { db, pool } from '../lib/db/client';
import { isEmbeddingConfigured } from '../lib/embeddings/client';
import { runOnce } from '../lib/embeddings/worker';

async function main() {
  if (!isEmbeddingConfigured()) {
    console.error(
      '[embed-backfill] EMBEDDING_ENDPOINT and EMBEDDING_MODEL must be set. Aborting.',
    );
    process.exit(1);
  }

  // Count what's left so we can log a sensible progress line.
  const [{ rows: countRows }] = [
    (await db.execute(sql`
      SELECT count(*)::int AS n
      FROM notes
      WHERE embedding_stale = true AND trashed_at IS NULL
    `)) as unknown as { rows: Array<{ n: number }> },
  ];
  const initial = countRows[0]?.n ?? 0;
  console.log(`[embed-backfill] ${initial} note(s) pending`);

  let total = 0;
  // Drain the queue. `runOnce` grabs a locked batch and processes it; when it
  // returns 0 we are done (another worker may have drained the rest).
  for (;;) {
    const processed = await runOnce({ batchSize: 32 });
    if (processed === 0) break;
    total += processed;
    console.log(`[embed-backfill] ${total}/${initial} embedded`);
  }
  console.log(`[embed-backfill] done (${total} embedded this run)`);
  await pool.end();
}

main().catch((err) => {
  console.error('[embed-backfill] failed', err);
  process.exit(1);
});
