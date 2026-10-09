/**
 * Hybrid search for the search box, `GET /api/notes?q=` and MCP
 * `search_notes`.
 *
 * One SQL statement fuses two ranked candidate lists with Reciprocal Rank
 * Fusion (score = Σ 1 / (60 + rank)):
 *   - text:    `content_tsv @@ websearch_to_tsquery` OR an escaped title
 *              ILIKE, ranked by `ts_rank_cd` plus a title boost (≤ 500 rows,
 *              the list cap — every keyword hit still appears).
 *   - meaning: the k = 10 nearest embeddings by cosine distance, limited to
 *              AI-eligible notes (plaintext, not trashed) and trimmed by a
 *              relative cutoff against the best similarity.
 *
 * The meaning half only runs when an embedding provider is configured, the
 * pgvector column exists and the query is ≥ 3 characters. The query vector
 * goes through a short timeout, a small LRU and a per-user rate limit; any
 * failure falls back silently to text-only ranking — search never errors
 * because the embedding provider is down.
 *
 * Folder / tag / time / private filters come from `buildListConditions`, so
 * search honours exactly the same view as the unfiltered list.
 */

import { and, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { isEmbeddingColumnAvailable } from '../embeddings/availability';
import { embedOne, readEmbeddingConfig } from '../embeddings/client';
import { eligibleForAiSql } from '../embeddings/eligible';
import { rateLimit } from '../http/rate-limit';
import { buildListConditions, type ListNotesOptions, type ListNotesParams } from './service';
import type { NoteListItemDTO, SearchMatch } from '../types';

/** RRF damping constant (the standard value from the original paper). */
const RRF_K = 60;
/** Same cap as the unfiltered list. */
const MAX_RESULTS = 500;
/** Nearest neighbours considered by the meaning half. */
const VECTOR_K = 10;
/** Keep a vector hit only if its similarity is ≥ this fraction of the best. */
const VECTOR_RELATIVE_CUTOFF = 0.8;
/** Queries shorter than this are keyword-only (too little meaning to embed). */
const MIN_SEMANTIC_QUERY = 3;
const QUERY_EMBED_TIMEOUT_MS = 1500;
const QUERY_CACHE_SIZE = 100;
/** Per-user query embeddings: bursts of 10, then 2 per second. */
const QUERY_RATE = { capacity: 10, refillPerSec: 2 };

export interface SearchNotesOptions extends ListNotesOptions {
  /** Injected for tests. */
  fetchFn?: typeof fetch;
}

const queryCache = new Map<string, number[]>();

/**
 * Embed the search query, or return null when the meaning half should be
 * skipped (not configured, too short, rate limited, slow or failing).
 */
export async function queryVector(
  userId: string,
  q: string,
  fetchFn: typeof fetch = fetch,
): Promise<number[] | null> {
  const cfg = readEmbeddingConfig();
  if (!cfg || q.length < MIN_SEMANTIC_QUERY) return null;

  const key = `${cfg.model}\u0000${q}`;
  const hit = queryCache.get(key);
  if (hit) {
    // Refresh recency: Map iteration order is insertion order.
    queryCache.delete(key);
    queryCache.set(key, hit);
    return hit;
  }

  try {
    if (!(await isEmbeddingColumnAvailable())) return null;
    if (!rateLimit(`search-embed:${userId}`, QUERY_RATE).ok) return null;
    const timedFetch: typeof fetch = (input, init) =>
      fetchFn(input, { ...init, signal: AbortSignal.timeout(QUERY_EMBED_TIMEOUT_MS) });
    const vec = await embedOne(q, { fetchFn: timedFetch, config: cfg });
    queryCache.set(key, vec);
    if (queryCache.size > QUERY_CACHE_SIZE) {
      const oldest = queryCache.keys().next().value;
      if (oldest !== undefined) queryCache.delete(oldest);
    }
    return vec;
  } catch (err) {
    console.warn('[search] query embedding failed; using keyword ranking only', err);
    return null;
  }
}

/** Escape LIKE metacharacters so a query like `50%` matches literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Build the single hybrid-search statement. Exported for SQL-shape tests. */
export function buildSearchSql(
  userId: string,
  params: ListNotesParams & { q: string },
  opts: ListNotesOptions,
  vector: number[] | null,
) {
  const q = params.q;
  const where = and(...buildListConditions(userId, params, opts));
  const titlePattern = `%${escapeLike(q)}%`;
  const tsquery = sql`websearch_to_tsquery('english', ${q})`;
  const titleMatch = sql`notes.title ILIKE ${titlePattern}`;

  const vectorCte = vector
    ? sql`
      SELECT id, row_number() OVER (ORDER BY sim DESC) AS rank
      FROM (
        SELECT id, sim, max(sim) OVER () AS top
        FROM (
          SELECT notes.id, 1 - (content_embedding <=> ${`[${vector.join(',')}]`}::vector) AS sim
          FROM notes
          WHERE ${where}
            AND ${eligibleForAiSql}
            AND content_embedding IS NOT NULL
          ORDER BY sim DESC
          LIMIT ${VECTOR_K}
        ) nearest
      ) scored
      WHERE sim >= top * ${VECTOR_RELATIVE_CUTOFF}`
    : sql`SELECT NULL::uuid AS id, NULL::bigint AS rank WHERE false`;

  return sql`
    WITH text_hits AS (
      SELECT notes.id,
        row_number() OVER (
          ORDER BY ts_rank_cd(content_tsv, ${tsquery})
                   + CASE WHEN ${titleMatch} THEN 1 ELSE 0 END DESC,
                   notes.updated_at DESC
        ) AS rank
      FROM notes
      WHERE ${where}
        AND (content_tsv @@ ${tsquery} OR ${titleMatch})
      ORDER BY rank
      LIMIT ${MAX_RESULTS}
    ),
    vector_hits AS (${vectorCte}),
    fused AS (
      SELECT COALESCE(t.id, v.id) AS id,
        COALESCE(1.0 / (${RRF_K} + t.rank), 0) + COALESCE(1.0 / (${RRF_K} + v.rank), 0) AS score,
        t.id IS NOT NULL AS by_text,
        v.id IS NOT NULL AS by_meaning
      FROM text_hits t
      FULL OUTER JOIN vector_hits v ON v.id = t.id
    )
    SELECT
      notes.id,
      notes.folder_id AS "folderId",
      notes.title,
      notes.snippet,
      notes.content_text AS "contentText",
      notes.has_image AS "hasImage",
      notes.pinned,
      notes.updated_at AS "updatedAt",
      notes.encryption IS NOT NULL AS "isPrivate",
      COALESCE(
        (SELECT array_agg(nt.tag_id) FROM note_tags nt WHERE nt.note_id = notes.id),
        ARRAY[]::uuid[]
      ) AS "tagIds",
      fused.by_text AS "byText",
      fused.by_meaning AS "byMeaning"
    FROM fused
    JOIN notes ON notes.id = fused.id
    ORDER BY fused.score DESC, notes.updated_at DESC
    LIMIT ${MAX_RESULTS}
  `;
}

interface SearchRow {
  id: string;
  folderId: string | null;
  title: string;
  snippet: string;
  contentText: string;
  hasImage: boolean;
  pinned: boolean;
  updatedAt: Date | string;
  isPrivate: boolean;
  tagIds: string[] | null;
  byText: boolean;
  byMeaning: boolean;
}

function matchOf(r: SearchRow): SearchMatch {
  if (r.byText && r.byMeaning) return 'both';
  return r.byMeaning ? 'meaning' : 'text';
}

export async function searchNotes(
  userId: string,
  params: ListNotesParams & { q: string },
  opts: SearchNotesOptions = {},
): Promise<NoteListItemDTO[]> {
  const q = params.q.trim();
  if (q.length === 0) return [];
  const vector = await queryVector(userId, q, opts.fetchFn);
  const res = await db.execute(buildSearchSql(userId, { ...params, q }, opts, vector));
  const rows = (res as unknown as { rows: SearchRow[] }).rows ?? [];
  return rows.map((r) => ({
    id: r.id,
    folderId: r.folderId,
    title: r.title,
    // Private rows have empty contentText/snippet by construction.
    snippet: r.isPrivate ? '' : r.snippet || (r.contentText ?? '').slice(0, 180),
    pinned: r.pinned,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    tagIds: (r.tagIds ?? []).filter((x): x is string => typeof x === 'string'),
    hasImage: r.hasImage,
    private: r.isPrivate,
    matchedBy: matchOf(r),
  }));
}

/** Tests only. */
export function __resetSearchCacheForTests() {
  queryCache.clear();
}
