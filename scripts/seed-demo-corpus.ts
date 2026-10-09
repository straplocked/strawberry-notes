/**
 * Seed the labelled demo corpus (scripts/fixtures/demo-corpus.json) into an
 * existing account, through the service layer, so screenshots and search
 * evals run against realistic but fictional notes — never personal ones.
 *
 * Idempotent: folders are reused by name and notes whose title already
 * exists for the user are skipped. Embeddings are computed by the in-process
 * worker (or `npm run db:embed`) like any other write.
 *
 * Usage (main checkout):
 *   docker compose exec app npx tsx scripts/seed-demo-corpus.ts demo@example.com
 */

import { and, eq } from 'drizzle-orm';
import { db, pool } from '../lib/db/client';
import { notes } from '../lib/db/schema';
import { markdownToDoc } from '../lib/markdown/from-markdown';
import { createFolder, listFolders } from '../lib/notes/folder-service';
import { createNote, updateNote } from '../lib/notes/service';
import { loadCorpus, userIdForEmail } from './demo-corpus';

async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error('usage: tsx scripts/seed-demo-corpus.ts <email>');
    process.exit(2);
  }
  const userId = await userIdForEmail(email);
  if (!userId) {
    console.error(`[seed-demo] no user with email ${email}; create it first (npm run user:create)`);
    process.exit(1);
  }

  const corpus = loadCorpus();
  const folderIds = new Map<string, string>();
  for (const f of await listFolders(userId)) folderIds.set(f.name, f.id);

  let created = 0;
  for (const n of corpus.notes) {
    const [existing] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.title, n.title)));
    if (existing) continue;

    let folderId = folderIds.get(n.folder);
    if (!folderId) {
      folderId = (await createFolder(userId, { name: n.folder })).id;
      folderIds.set(n.folder, folderId);
    }
    const note = await createNote(userId, {
      folderId,
      title: n.title,
      content: markdownToDoc(n.markdown),
      tagNames: n.tags,
    });
    if (n.pinned) await updateNote(userId, note.id, { pinned: true });
    created += 1;
  }
  console.log(
    `[seed-demo] ${created} note(s) created, ${corpus.notes.length - created} already present`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error('[seed-demo] failed', err);
  process.exit(1);
});
