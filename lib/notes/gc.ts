/**
 * Attachment garbage collection.
 *
 * Two entry points:
 *   - `deleteOrphanAttachmentsForNote(userId, noteId)` — helper called from
 *     hard-delete of a note, drops attachment rows whose note was just
 *     removed AND their files.
 *   - `gcOrphanAttachments(userId)` — operator-driven sweep: any attachment
 *     whose noteId is null (or references a vanished note) is removed, files
 *     and rows.
 *
 * Both are strictly user-scoped: ownership is checked by the WHERE clause so
 * a compromised handler cannot touch another user's data.
 */

import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { attachments, notes } from '../db/schema';
import { uploadsDir } from '../storage';

/**
 * Grace window that keeps recently-uploaded attachments out of the orphan
 * sweep. The upload flow inserts the row with `noteId=NULL` and the client
 * links it to a note on the next save — so any GC that runs in between would
 * destroy a legitimate pending upload. Five minutes is enough for a slow
 * human edit while keeping stale orphans short-lived.
 */
const ORPHAN_GRACE_SECONDS = 5 * 60;

export interface GcResult {
  removedFiles: number;
  removedRows: number;
  freedBytes: number;
}

/**
 * Remove every orphan attachment for `userId`:
 *   - noteId IS NULL (was never attached, or note was deleted with SET NULL)
 *   - noteId references a missing note (defensive — FK should prevent this)
 *
 * Each match has its file unlinked (best-effort; missing files still count
 * toward the row removal) then its row deleted.
 */
export async function gcOrphanAttachments(userId: string): Promise<GcResult> {
  const rows = await db
    .select({
      id: attachments.id,
      storagePath: attachments.storagePath,
      size: attachments.size,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, userId),
        sql`${attachments.createdAt} < NOW() - INTERVAL '${sql.raw(String(ORPHAN_GRACE_SECONDS))} seconds'`,
        // orphan = noteId is NULL *or* the referenced note is gone.
        // We express "note is gone" with a correlated NOT EXISTS.
        sql`(${attachments.noteId} IS NULL OR NOT EXISTS (
          SELECT 1 FROM ${notes}
          WHERE ${notes.id} = ${attachments.noteId}
            AND ${notes.userId} = ${userId}
        ))`,
      ),
    );

  return removeAttachments(rows);
}

/**
 * Remove all attachments that were attached to the given note. Called when a
 * note is hard-deleted so its images don't become orphans on disk.
 *
 * The schema sets `attachments.noteId = NULL` on note delete by default; this
 * function is the symmetric "also delete the rows/files" action and MUST be
 * called before the note row itself is dropped so we still know which
 * attachments belonged to it.
 */
export async function deleteAttachmentsForNote(
  userId: string,
  noteId: string,
): Promise<GcResult> {
  const rows = await db
    .select({
      id: attachments.id,
      storagePath: attachments.storagePath,
      size: attachments.size,
    })
    .from(attachments)
    .where(and(eq(attachments.userId, userId), eq(attachments.noteId, noteId)));

  return removeAttachments(rows);
}

// --- internal --------------------------------------------------------------

async function removeAttachments(
  rows: Array<{ id: string; storagePath: string; size: number }>,
): Promise<GcResult> {
  if (rows.length === 0) return { removedFiles: 0, removedRows: 0, freedBytes: 0 };

  const dir = uploadsDir();
  const dirAbs = resolve(dir) + '/';
  let removedFiles = 0;
  let freedBytes = 0;

  for (const r of rows) {
    const full = resolve(join(dir, r.storagePath));
    // Defensive containment check: refuse to unlink anything that resolves
    // outside the uploads directory, even if the storagePath is corrupted.
    if (!full.startsWith(dirAbs)) continue;
    try {
      await unlink(full);
      removedFiles += 1;
      freedBytes += r.size;
    } catch (err) {
      // ENOENT is expected on previously-cleaned storage; treat as still-freed
      // so freedBytes stays accurate from the operator's perspective. Other
      // errors (EACCES, EIO) are swallowed — we still want to drop the row.
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        freedBytes += r.size;
      }
    }
  }

  // Delete the rows in one round-trip.
  const ids = rows.map((r) => r.id);
  const deleted = await db
    .delete(attachments)
    .where(inArray(attachments.id, ids))
    .returning({ id: attachments.id });

  return {
    removedFiles,
    removedRows: deleted.length,
    freedBytes,
  };
}

/**
 * Thin wrapper used by tests and callers that only need the query shape
 * (without touching the filesystem). Matches the criteria used by
 * gcOrphanAttachments.
 */
export async function listOrphanAttachments(userId: string) {
  return db
    .select({
      id: attachments.id,
      noteId: attachments.noteId,
      storagePath: attachments.storagePath,
      size: attachments.size,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, userId),
        sql`${attachments.createdAt} < NOW() - INTERVAL '${sql.raw(String(ORPHAN_GRACE_SECONDS))} seconds'`,
        sql`(${attachments.noteId} IS NULL OR NOT EXISTS (
          SELECT 1 FROM ${notes}
          WHERE ${notes.id} = ${attachments.noteId}
            AND ${notes.userId} = ${userId}
        ))`,
      ),
    );
}

