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
 * Failure handling: a batch the provider rejects is retried one row at a time,
 * so one bad row (say, an input the model refuses) can't block the other 15.
 * Any failure reschedules the next run with doubling backoff — 30 s, 1 min,
 * 2 min … capped at 15 min — and the first clean run resets it. The latest
 * error and success time are kept in memory (`getEmbeddingWorkerStatus`).
 *
 * `instrumentation.ts` kicks the worker once at boot, so enabling embeddings
 * on an instance with existing notes fills them in without any edits.
 *
 * If embeddings are not configured, the worker is a no-op (no timer armed).
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { isEmbeddingColumnAvailable } from './availability';
import {
  embedBatch,
  embeddingInputFor,
  isEmbeddingConfigured,
  readEmbeddingConfig,
} from './client';
import { eligibleForAiSql } from './eligible';

const BATCH_SIZE = 16;
const INITIAL_DELAY_MS = 500;
const IDLE_BACKOFF_MS = 30_000;
const ERROR_BACKOFF_BASE_MS = 30_000;
const ERROR_BACKOFF_MAX_MS = 15 * 60_000;

let inFlight = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let disabledLogged = false;
let consecutiveFailures = 0;
let lastError: string | null = null;
let lastSuccessAt: Date | null = null;
/** Rows that failed in the most recent `runOnce`; drives the backoff. */
let lastRunFailed = 0;

export interface EmbeddingWorkerStatus {
  lastError: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
}

/** In-memory health of this process's worker. */
export function getEmbeddingWorkerStatus(): EmbeddingWorkerStatus {
  return {
    lastError,
    lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
    consecutiveFailures,
  };
}

/** Delay before the next run after `failures` consecutive failed runs. */
export function errorBackoffMs(failures: number): number {
  const exp = Math.max(0, failures - 1);
  return Math.min(ERROR_BACKOFF_MAX_MS, ERROR_BACKOFF_BASE_MS * 2 ** Math.min(exp, 10));
}

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
    void tick();
  }, delayMs);
  // Don't keep Node alive for a background-only timer.
  if (typeof pendingTimer === 'object' && pendingTimer && 'unref' in pendingTimer) {
    (pendingTimer as unknown as { unref(): void }).unref();
  }
}

/** One scheduled run: process a batch, then decide when to run next. */
async function tick(): Promise<void> {
  let processed: number;
  try {
    processed = await runOnce();
  } catch (err) {
    onFailure(err);
    return;
  }
  if (lastRunFailed > 0) {
    onFailure(new Error(lastError ?? `${lastRunFailed} row(s) failed to embed`));
    return;
  }
  consecutiveFailures = 0;
  // A full batch means more rows may remain — re-kick soon.
  if (processed === BATCH_SIZE) kickSoon();
  else kickLater();
}

function onFailure(err: unknown): void {
  consecutiveFailures += 1;
  lastError = err instanceof Error ? err.message : String(err);
  const delay = errorBackoffMs(consecutiveFailures);
  console.error(
    `[embeddings] worker error (attempt ${consecutiveFailures}); retrying in ${Math.round(delay / 1000)}s`,
    err,
  );
  kickAfterBackoff(delay);
}

/**
 * Embed a single batch of stale rows. Exported for the backfill script and
 * for unit tests. Returns the number of rows embedded. Does not schedule the
 * next run — `tick` (timer path) and the backfill loop each decide that.
 *
 * If the batch call fails, each row is retried on its own; rows that still
 * fail stay stale for a later run. Throws only when no row could be embedded
 * (provider down, misconfigured), so the caller sees the real error.
 */
export async function runOnce(
  opts: { fetchFn?: typeof fetch; batchSize?: number } = {},
): Promise<number> {
  const cfg = readEmbeddingConfig();
  if (!cfg) return 0;
  // pgvector wasn't available when migrations ran (see
  // drizzle/0005_embeddings.sql), so `content_embedding` doesn't exist.
  // Stay idle rather than querying a column that isn't there.
  if (!(await isEmbeddingColumnAvailable())) return 0;
  if (inFlight) return 0;
  inFlight = true;
  lastRunFailed = 0;
  try {
    const batch = opts.batchSize ?? BATCH_SIZE;
    // Lock a batch of stale, eligible rows. Using `FOR UPDATE SKIP LOCKED`
    // means two replicas running in parallel don't collide, and a crashed
    // worker releases its rows on connection close.
    // `eligibleForAiSql` (encryption IS NULL AND trashed_at IS NULL) is
    // belt-and-suspenders: the service layer never sets
    // `embedding_stale = true` on a private write, so this filter only
    // matters if a row's privacy state was somehow toggled out of band.
    const rows = await db.execute(sql`
      SELECT id, title, content_text
      FROM notes
      WHERE embedding_stale = true AND ${eligibleForAiSql}
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
    if (!list || list.length === 0) return 0;
    const inputs = list.map((r) => embeddingInputFor(r.title ?? '', r.content_text ?? ''));
    let vectors: Array<number[] | null>;
    try {
      vectors = await embedBatch(inputs, { fetchFn: opts.fetchFn, config: cfg });
    } catch (batchErr) {
      if (list.length === 1) throw batchErr;
      // Retry row by row so one bad input doesn't block the rest of the batch.
      vectors = [];
      let lastRowErr: unknown = batchErr;
      for (const input of inputs) {
        try {
          const [v] = await embedBatch([input], { fetchFn: opts.fetchFn, config: cfg });
          vectors.push(v);
        } catch (rowErr) {
          lastRowErr = rowErr;
          vectors.push(null);
        }
      }
      const failed = vectors.filter((v) => v === null).length;
      if (failed === list.length) throw lastRowErr;
      lastRunFailed = failed;
      lastError =
        lastRowErr instanceof Error ? lastRowErr.message : String(lastRowErr ?? batchErr);
    }

    // Update each row individually — PG's CASE-based update of a vector column
    // is ugly and we only batch ~16 at a time.
    //
    // Re-check `eligibleForAiSql` in the UPDATE itself, not just the earlier
    // SELECT: the `FOR UPDATE SKIP LOCKED` row lock releases when that
    // SELECT's statement ends — well before the `embedBatch` HTTP round trip
    // below returns (see the module comment on replica coordination). If the
    // user locks the note as Private Notes during that window, this guard is
    // what stops the freshly-computed vector from being written into a note
    // that is now supposed to have never been embedded.
    let written = 0;
    for (let i = 0; i < list.length; i += 1) {
      const row = list[i];
      const v = vectors[i];
      if (!v) continue;
      const literal = `[${v.join(',')}]`;
      await db.execute(sql`
        UPDATE notes
        SET content_embedding = ${literal}::vector,
            embedding_stale = false
        WHERE id = ${row.id} AND ${eligibleForAiSql}
      `);
      written += 1;
    }
    lastSuccessAt = new Date();
    return written;
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
  // Deliberately NOT `pendingTimer`: a write during the idle wait should still
  // be embedded within INITIAL_DELAY_MS.
  const t = setTimeout(() => kickEmbeddingWorker(0), IDLE_BACKOFF_MS);
  if (typeof t === 'object' && t && 'unref' in t) {
    (t as unknown as { unref(): void }).unref();
  }
}

function kickAfterBackoff(delayMs: number) {
  // Occupies `pendingTimer`, so write-triggered kicks during the backoff
  // coalesce into this run instead of hammering a failing provider.
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void tick();
  }, delayMs);
  if (typeof pendingTimer === 'object' && pendingTimer && 'unref' in pendingTimer) {
    (pendingTimer as unknown as { unref(): void }).unref();
  }
}

/** Reset internal timer/lock state. Tests only. */
export function __resetWorkerForTests() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  inFlight = false;
  disabledLogged = false;
  consecutiveFailures = 0;
  lastError = null;
  lastSuccessAt = null;
  lastRunFailed = 0;
}
