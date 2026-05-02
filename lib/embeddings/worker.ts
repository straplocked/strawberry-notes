/**
 * In-process embedding worker.
 *
 * Fire-and-forget: after any content edit the service marks the row with
 * `embedding_stale = true`, then calls `kickEmbeddingWorker()`. This module
 * owns a single timer + in-flight lock so multiple kicks coalesce into one
 * batch.
 *
 * Concurrency model: the single in-process `inFlight` guard is the correctness
 * boundary. The SELECT uses `FOR UPDATE SKIP LOCKED` as a cheap hint, but the
 * lock releases when the surrounding autocommit statement ends — *before* the
 * embed HTTP call — so it does NOT fully coordinate across replicas. Running
 * `docker compose up --scale app=N` with N > 1 can therefore re-embed the same
 * note in each replica; the result converges because the final UPDATE sets the
 * latest vector and `embedding_stale = false`, but you spend N× the embedding
 * API budget. Single-replica (the default) is the supported deployment model;
 * at larger scale run the backfill script (`npm run db:embed`) from one host
 * and disable the in-process worker with an env guard (follow-up).
 *
 * If embeddings are not configured, the worker is a no-op (no timer armed).
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  embedBatch,
  embeddingInputFor,
  isEmbeddingConfigured,
  readEmbeddingConfig,
} from './client';

const BATCH_SIZE = 16;
const INITIAL_DELAY_MS = 500;
const IDLE_BACKOFF_MS = 30_000;

let inFlight = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let disabledLogged = false;

/** Schedule a worker run. Safe to call many times; runs coalesce. */
export function kickEmbeddingWorker(delayMs: number = INITIAL_DELAY_MS): void {
  if (!isEmbeddingConfigured()) {
    if (!disabledLogged) {
      // Log once so the operator knows why embeddings aren't populating,
      // without spamming the logs.
      console.info(
        '[embeddings] EMBEDDING_ENDPOINT not set — worker disabled. Semantic search will return a not-configured error.',
      );
      disabledLogged = true;
    }
    return;
  }
  if (inFlight || pendingTimer) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void runOnce().catch((err) => {
      console.error('[embeddings] worker error', err);
    });
  }, delayMs);
  // Don't keep Node alive for a background-only timer.
  if (typeof pendingTimer === 'object' && pendingTimer && 'unref' in pendingTimer) {
    (pendingTimer as unknown as { unref(): void }).unref();
  }
}

/**
 * Embed a single batch of stale rows. Exported for the backfill script and
 * for unit tests. Returns the number of rows processed.
 */
export async function runOnce(
  opts: { fetchFn?: typeof fetch; batchSize?: number } = {},
): Promise<number> {
  const cfg = readEmbeddingConfig();
  if (!cfg) return 0;
  if (inFlight) return 0;
  inFlight = true;
  try {
    const batch = opts.batchSize ?? BATCH_SIZE;
    // Lock a batch of stale, non-trashed rows. Using `FOR UPDATE SKIP LOCKED`
    // means two replicas running in parallel don't collide, and a crashed
    // worker releases its rows on connection close.
    // `encryption IS NULL` is belt-and-suspenders: the service layer never
    // sets `embedding_stale = true` on a private write, so this filter only
    // matters if a row's privacy state was somehow toggled out of band.
    const rows = await db.execute(sql`
      SELECT id, title, content_text
      FROM notes
      WHERE embedding_stale = true AND trashed_at IS NULL AND encryption IS NULL
      ORDER BY updated_at DESC
      LIMIT ${batch}
      FOR UPDATE SKIP LOCKED
    `);
    // node-postgres returns rows in `.rows` on the QueryResult-ish object that
    // drizzle passes through.
    const list = (
      rows as unknown as {
        rows: Array<{ id: string; title: string; content_text: string }>;
      }
    ).rows;
    if (!list || list.length === 0) {
      // Nothing to do; reschedule further out so a long-idle server doesn't
      // hot-loop the DB.
      kickLater();
      return 0;
    }
    const inputs = list.map((r) => embeddingInputFor(r.title ?? '', r.content_text ?? ''));
    const vectors = await embedBatch(inputs, { fetchFn: opts.fetchFn, config: cfg });

    // Update each row individually — PG's CASE-based update of a vector column
    // is ugly and we only batch ~16 at a time.
    for (let i = 0; i < list.length; i += 1) {
      const row = list[i];
      const v = vectors[i];
      const literal = `[${v.join(',')}]`;
      await db.execute(sql`
        UPDATE notes
        SET content_embedding = ${literal}::vector,
            embedding_stale = false
        WHERE id = ${row.id}
      `);
    }

    // More rows may remain — re-kick soon.
    if (list.length === batch) {
      kickSoon();
    } else {
      kickLater();
    }
    return list.length;
  } finally {
    inFlight = false;
  }
}

function kickSoon() {
  // Same lock/guard path as the public API.
  setImmediate(() => kickEmbeddingWorker(100));
}

function kickLater() {
  // Long-tail sweep. In production the worker is also re-kicked on each write,
  // so this timer mostly exists to catch rows that were imported out-of-band.
  const t = setTimeout(() => kickEmbeddingWorker(0), IDLE_BACKOFF_MS);
  if (typeof t === 'object' && t && 'unref' in t) {
    (t as unknown as { unref(): void }).unref();
  }
}

/** Reset internal timer/lock state. Tests only. */
export function __resetWorkerForTests() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  inFlight = false;
  disabledLogged = false;
}
