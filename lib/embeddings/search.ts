/**
 * Semantic search over `notes.content_embedding`. Uses pgvector's cosine
 * distance (`<=>`) operator; results are converted to a similarity score
 * (`1 - distance`) for intuitive ranking (higher = closer).
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import type { NoteListItemDTO } from '../types';
import { embedOne, EmbeddingNotConfiguredError, readEmbeddingConfig } from './client';

export interface SemanticSearchResult extends NoteListItemDTO {
  score: number;
}

export interface SemanticSearchOptions {
  k?: number;
  fetchFn?: typeof fetch;
}

/**
 * Embed `query`, then fetch the top `k` non-trashed notes owned by `userId`
 * ordered by cosine similarity. Default k=10, max 50.
 *
 * Throws `EmbeddingNotConfiguredError` if the provider env is missing.
 */
export async function semanticSearch(
  userId: string,
  query: string,
  opts: SemanticSearchOptions = {},
): Promise<SemanticSearchResult[]> {
  const cfg = readEmbeddingConfig();
  if (!cfg) throw new EmbeddingNotConfiguredError();
  const q = query.trim();
  if (q.length === 0) return [];

  const k = Math.max(1, Math.min(50, opts.k ?? 10));
  const [vec] = await embedMany(q, cfg, opts.fetchFn);
  const literal = `[${vec.join(',')}]`;

  // We deliberately filter `content_embedding IS NOT NULL` so freshly imported
  // notes that haven't been embedded yet don't leak in as distance-zero rows.
  // Aggregate tag ids in the same query — matches the shape `listNotes` returns
  // so the client can reuse its row renderer.
  const rows = await db.execute(sql`
    SELECT
      n.id,
      n.folder_id AS "folderId",
      n.title,
      n.snippet,
      n.content_text AS "contentText",
      n.has_image AS "hasImage",
      n.pinned,
      n.updated_at AS "updatedAt",
      COALESCE(
        ARRAY_AGG(nt.tag_id) FILTER (WHERE nt.tag_id IS NOT NULL),
        ARRAY[]::uuid[]
      ) AS "tagIds",
      1 - (n.content_embedding <=> ${literal}::vector) AS score
    FROM notes n
    LEFT JOIN note_tags nt ON nt.note_id = n.id
    WHERE n.user_id = ${userId}
      AND n.trashed_at IS NULL
      AND n.content_embedding IS NOT NULL
      AND n.encryption IS NULL
    GROUP BY n.id
    ORDER BY n.content_embedding <=> ${literal}::vector
    LIMIT ${k}
  `);

  const list = (
    rows as unknown as {
      rows: Array<{
        id: string;
        folderId: string | null;
        title: string;
        snippet: string;
        contentText: string;
        hasImage: boolean;
        pinned: boolean;
        updatedAt: Date | string;
        tagIds: string[] | null;
        score: number | string;
      }>;
    }
  ).rows;

  return list.map((r) => ({
    id: r.id,
    folderId: r.folderId,
    title: r.title,
    snippet: r.snippet || (r.contentText ?? '').slice(0, 180),
    pinned: r.pinned,
    hasImage: r.hasImage,
    tagIds: (r.tagIds ?? []).filter((x): x is string => typeof x === 'string'),
    updatedAt:
      r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    // Always false here — the `encryption IS NULL` SQL filter above ensures
    // private notes never reach this branch. Kept for DTO compatibility.
    private: false,
    score: Number(r.score),
  }));
}

// Small helper so the test suite can stub the network call out once.
async function embedMany(
  input: string,
  cfg: ReturnType<typeof readEmbeddingConfig>,
  fetchFn?: typeof fetch,
): Promise<number[][]> {
  const v = await embedOne(input, { fetchFn, config: cfg });
  return [v];
}
