/**
 * Shared loader for scripts/fixtures/demo-corpus.json — the labelled demo
 * corpus used by seed-demo-corpus.ts, eval-search.ts and the launch
 * screenshots. Not an entry point.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { users } from '../lib/db/schema';

export interface CorpusNote {
  cluster: string;
  folder: string;
  title: string;
  tags: string[];
  pinned: boolean;
  markdown: string;
}

export interface CorpusQuery {
  query: string;
  expect: string;
  kind: 'paraphrase' | 'exact';
}

export interface DemoCorpus {
  notes: CorpusNote[];
  queries: CorpusQuery[];
}

export function loadCorpus(): DemoCorpus {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'demo-corpus.json'), 'utf8'),
  ) as DemoCorpus;
}

export async function userIdForEmail(email: string): Promise<string | null> {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  return u?.id ?? null;
}

/** Wait until the embedding worker has caught up on this user's notes. */
export async function staleCount(userId: string): Promise<number> {
  const res = (await db.execute(sql`
    SELECT count(*)::int AS n FROM notes
    WHERE user_id = ${userId} AND embedding_stale = true
      AND encryption IS NULL AND trashed_at IS NULL
  `)) as unknown as { rows: Array<{ n: number }> };
  return res.rows[0]?.n ?? 0;
}
