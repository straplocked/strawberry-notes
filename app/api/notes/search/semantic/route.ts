/**
 * POST /api/notes/search/semantic
 *
 * Body: { query: string, k?: number }
 * Returns: NoteListItemDTO[] with an extra `score` field (cosine similarity
 * in [0, 1]; higher = closer).
 *
 * 503 if the embedding provider is not configured. Accepts either the browser
 * session or a bearer token so programmatic clients can call it.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserIdForApi } from '@/lib/auth/require-api';
import { EmbeddingNotConfiguredError } from '@/lib/embeddings/client';
import { semanticSearch } from '@/lib/embeddings/search';

export const dynamic = 'force-dynamic';

const Body = z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().positive().max(50).optional(),
});

export async function POST(req: Request) {
  const a = await requireUserIdForApi(req);
  if (!a.ok) return a.response;

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    const results = await semanticSearch(a.userId, parsed.data.query, {
      k: parsed.data.k,
    });
    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof EmbeddingNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('[semantic-search] failed', err);
    return NextResponse.json(
      { error: 'semantic search failed' },
      { status: 502 },
    );
  }
}
