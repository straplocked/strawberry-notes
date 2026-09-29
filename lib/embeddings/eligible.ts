/**
 * Shared "eligible for AI" predicate: a note may be embedded (or fed to any
 * future AI feature that reads note bodies) only when it is plaintext — not
 * locked via Private Notes — and not trashed.
 *
 * This is a raw-SQL fragment, not a drizzle query-builder condition, so it
 * can be interpolated directly into `db.execute(sql\`...\`)` templates. It
 * assumes the query's target table is the unaliased `notes` table (every
 * current call site — see lib/embeddings/worker.ts) and uses unqualified
 * column names accordingly. A query that aliases `notes` (e.g.
 * `FROM notes n`) should qualify the columns itself rather than reuse this
 * fragment as-is.
 *
 * Exported centrally so every place that decides "can this note be embedded"
 * agrees, instead of each call site re-deriving its own `encryption IS NULL
 * AND trashed_at IS NULL` and risking drift. See
 * docs/technical/private-notes.md for why locked notes must never reach an
 * embedding provider.
 */

import { sql, type SQL } from 'drizzle-orm';

export const eligibleForAiSql: SQL = sql`encryption IS NULL AND trashed_at IS NULL`;
