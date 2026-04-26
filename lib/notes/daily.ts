/**
 * "Today" / daily-note service. Idempotently opens or creates a note titled
 * `Daily — YYYY-MM-DD` (operator's local time, server side) under a `Daily`
 * folder, creating the folder once on first call.
 *
 * Design notes:
 * - Title format is fixed and case-sensitive. Lookup is by exact match — that
 *   keeps the contract simple for MCP callers and the sidebar button.
 * - Date is taken from the *server's* clock so a user roaming between time
 *   zones still gets one note per civil day on the host. If you want
 *   per-user TZ, that's a future enhancement; the non-bloat tradeoff for v1
 *   is "one config knob isn't worth the surface area."
 * - Uses the same `kickEmbeddingWorker` fire-and-forget pattern as the rest
 *   of the create path so semantic search still finds today's note quickly.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { folders, notes } from '../db/schema';
import {
  docHasImage,
  docToPlainText,
  snippetFromDoc,
} from '../editor/prosemirror-utils';
import { kickEmbeddingWorker } from '../embeddings/worker';
import { getNote } from './service';
import type { NoteDTO, PMDoc } from '../types';

const DAILY_FOLDER_NAME = 'Daily';
const DAILY_FOLDER_COLOR = '#5fae6a';

/** YYYY-MM-DD in the host's local time. Stable string used as the title key. */
export function dailyTitleFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `Daily — ${y}-${m}-${d}`;
}

function dailyTemplate(title: string): PMDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: title }],
      },
      { type: 'paragraph' },
    ],
  };
}

async function findExistingDaily(
  userId: string,
  title: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.title, title),
        isNull(notes.trashedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function ensureDailyFolder(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.userId, userId), eq(folders.name, DAILY_FOLDER_NAME)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(folders)
    .values({
      userId,
      name: DAILY_FOLDER_NAME,
      color: DAILY_FOLDER_COLOR,
      position: 0,
    })
    .returning({ id: folders.id });
  return created.id;
}

export interface DailyNoteResult {
  note: NoteDTO;
  /** True iff a fresh row was inserted on this call. */
  created: boolean;
}

export async function openOrCreateDailyNote(
  userId: string,
  now: Date = new Date(),
): Promise<DailyNoteResult> {
  const title = dailyTitleFor(now);

  const existing = await findExistingDaily(userId, title);
  if (existing) {
    const note = await getNote(userId, existing.id);
    if (note) return { note, created: false };
    // The row was found by id but getNote returned null — treat as a race and
    // fall through to create a new one rather than 500.
  }

  const folderId = await ensureDailyFolder(userId);
  const doc = dailyTemplate(title);
  const [row] = await db
    .insert(notes)
    .values({
      userId,
      folderId,
      title,
      content: doc,
      contentText: docToPlainText(doc),
      snippet: snippetFromDoc(doc),
      hasImage: docHasImage(doc),
      embeddingStale: true,
    })
    .returning({ id: notes.id });

  kickEmbeddingWorker();

  const dto = await getNote(userId, row.id);
  if (!dto) {
    // Vanishingly unlikely: row was just inserted and is owned by this user.
    throw new Error('daily note vanished after creation');
  }
  return { note: dto, created: true };
}
