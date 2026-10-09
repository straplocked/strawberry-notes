/**
 * Search quality check for the hybrid search box (lib/notes/search.ts),
 * run against the seeded demo corpus with a real embedding model.
 *
 * Passes when every fixed query in scripts/fixtures/demo-corpus.json has its
 * expected note in the top 3. Drains the embedding queue first so results
 * don't depend on how far the worker has got.
 *
 * Usage (main checkout, after seed-demo-corpus.ts):
 *   docker compose exec app npx tsx scripts/eval-search.ts demo@example.com
 */

import { pool } from '../lib/db/client';
import { readEmbeddingConfig } from '../lib/embeddings/client';
import { runOnce } from '../lib/embeddings/worker';
import { searchNotes } from '../lib/notes/search';
import { loadCorpus, staleCount, userIdForEmail } from './demo-corpus';

const TOP = 3;

async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error('usage: tsx scripts/eval-search.ts <email>');
    process.exit(2);
  }
  const userId = await userIdForEmail(email);
  if (!userId) {
    console.error(`[eval-search] no user with email ${email}`);
    process.exit(1);
  }
  const cfg = readEmbeddingConfig();
  console.log(
    cfg
      ? `[eval-search] model ${cfg.model} (${cfg.dims} dims)`
      : '[eval-search] no embedding provider configured — keyword ranking only',
  );

  if (cfg) {
    while ((await staleCount(userId)) > 0) {
      if ((await runOnce({ batchSize: 32 })) === 0) break;
    }
  }

  const corpus = loadCorpus();
  let passed = 0;
  for (const q of corpus.queries) {
    const results = await searchNotes(userId, { q: q.query });
    const top = results.slice(0, TOP);
    const rank = top.findIndex((r) => r.title === q.expect);
    const ok = rank !== -1;
    if (ok) passed += 1;
    const shown = top.map((r) => `${r.title} [${r.matchedBy}]`).join(' | ') || '(no results)';
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${q.kind.padEnd(10)} "${q.query}" → expected "${q.expect}"` +
        `${ok ? ` at #${rank + 1}` : ''}\n        top ${TOP}: ${shown}`,
    );
  }
  console.log(
    `[eval-search] ${passed}/${corpus.queries.length} queries with the expected note in the top ${TOP}`,
  );
  await pool.end();
  if (passed !== corpus.queries.length) process.exit(1);
}

main().catch((err) => {
  console.error('[eval-search] failed', err);
  process.exit(1);
});
