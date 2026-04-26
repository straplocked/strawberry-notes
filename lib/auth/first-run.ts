/**
 * First-run seeding for a freshly created account.
 *
 * Both the public signup route (`POST /api/auth/signup`) and the operator CLI
 * (`npm run user:create`) call this so a fresh login lands on something
 * better than an empty canvas:
 *
 * - A single `Journal` folder (the v1 default).
 * - A `Welcome to Strawberry Notes` note inside it that doubles as a
 *   feature tour for `[[wiki-links]]`, semantic search, and the MCP server.
 *
 * Returning the new ids makes the helper testable and lets callers reference
 * the seeded note (e.g. to set `activeNoteId` after a fresh signup, if the
 * UI ever wants to).
 */

import { db } from '../db/client';
import { folders, notes } from '../db/schema';
import {
  docHasImage,
  docToPlainText,
  snippetFromDoc,
} from '../editor/prosemirror-utils';
import type { PMDoc } from '../types';

const JOURNAL_NAME = 'Journal';
const JOURNAL_COLOR = '#e33d4e';
const WELCOME_TITLE = 'Welcome to Strawberry Notes';

function para(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
function heading(level: 1 | 2, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}
function bullets(items: string[]) {
  return {
    type: 'bulletList',
    content: items.map((text) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })),
  };
}

function welcomeDoc(): PMDoc {
  // Plain ProseMirror JSON — no marks, no nested wrappers — so the wiki-link
  // decoration plugin can find `[[…]]` literally and turn it into a chip,
  // and so the Markdown export round-trips without surprise.
  return {
    type: 'doc',
    content: [
      heading(1, WELCOME_TITLE),
      para(
        'A self-hosted notebook with a first-class AI + agent interface. A few things worth knowing on day one:',
      ),
      heading(2, 'Wiki-links + backlinks'),
      para(
        'Type [[ to link to another note. The chip becomes a real link the moment that note exists. The "Linked from" panel under each note shows everything that points back at it.',
      ),
      heading(2, 'Semantic search'),
      para(
        'When the operator configures an embeddings endpoint, you can ask by meaning, not just keyword: "what did I decide about pricing last quarter" finds the note even if it never used the word "pricing." Until then, full-text search still works.',
      ),
      heading(2, 'Agents over MCP'),
      para(
        'Settings → Personal Access Tokens lets you mint a token that Claude Desktop, Claude Code, Cursor, or any MCP client can use to read, search, and write your notes. Same operations as the REST API, exposed as agent tools.',
      ),
      heading(2, 'Bring everything home'),
      para(
        'The three-dots More button in the editor exports any single note as Markdown, or the whole workspace (notes + attachments + manifest) as a ZIP. There is no lock-in.',
      ),
      heading(2, 'Next steps'),
      bullets([
        'Click "Today" in the sidebar to start a daily note.',
        'Try the keyboard shortcut Cmd/Ctrl-N to create a new note.',
        'Type [[ in any note to link to another note by title.',
        'Delete this note when you no longer need it.',
      ]),
    ],
  };
}

export interface SeedResult {
  folderId: string;
  noteId: string;
}

export async function seedFirstRunContent(userId: string): Promise<SeedResult> {
  const [folder] = await db
    .insert(folders)
    .values({
      userId,
      name: JOURNAL_NAME,
      color: JOURNAL_COLOR,
      position: 0,
    })
    .returning({ id: folders.id });

  const doc = welcomeDoc();
  const [note] = await db
    .insert(notes)
    .values({
      userId,
      folderId: folder.id,
      title: WELCOME_TITLE,
      content: doc,
      contentText: docToPlainText(doc),
      snippet: snippetFromDoc(doc),
      hasImage: docHasImage(doc),
      embeddingStale: true,
    })
    .returning({ id: notes.id });

  return { folderId: folder.id, noteId: note.id };
}
