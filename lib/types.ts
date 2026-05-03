/**
 * Shared API types for Strawberry Notes. Matches the JSON shape returned by the
 * REST endpoints in app/api/**, consumed by React Query hooks in the client.
 */

export interface FolderDTO {
  id: string;
  /** Parent folder id for nesting; null for top-level folders. */
  parentId: string | null;
  name: string;
  color: string;
  position: number;
  /** Direct (own) note count. Does NOT include notes inside descendant folders. */
  count: number;
}

export interface TagDTO {
  id: string;
  name: string;
  count: number;
}

export interface NoteListItemDTO {
  id: string;
  folderId: string | null;
  title: string;
  snippet: string;
  pinned: boolean;
  updatedAt: string;
  tagIds: string[];
  hasImage: boolean;
  /**
   * True when the note's body is end-to-end encrypted (Private Notes feature).
   * The list endpoint always sets `snippet = ''` for these — the client renders
   * the localised "🔒 Private — unlock to read" placeholder instead.
   */
  private: boolean;
}

/** ProseMirror JSON document. Opaque to the client code outside the editor. */
export interface PMDoc {
  type: 'doc';
  content?: unknown[];
}

/**
 * Per-note encryption envelope. Mirrors `notes.encryption` JSONB. The base64
 * ciphertext lives in `NoteDTO.content` when this is non-null; the unwrapped
 * Note Master Key is held only in the browser. See
 * docs/technical/private-notes.md.
 */
export interface NoteEncryption {
  v: number;
  iv: string;
}

/**
 * Wrap-envelope JSON shape stored in `user_encryption.{passphrase,recovery}_wrap`.
 * Mirrored in `lib/crypto/private-notes.ts` (canonical type) — duplicated here
 * so client code can import the type without pulling the WebCrypto module.
 */
export interface PrivateNotesWrapBlob {
  v: number;
  kdf: 'PBKDF2-SHA256';
  iters: number;
  salt: string;
  iv: string;
  ct: string;
}

export interface PrivateNotesMaterial {
  version: number;
  passphraseWrap: PrivateNotesWrapBlob;
  recoveryWrap: PrivateNotesWrapBlob;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateNotesStatus {
  configured: boolean;
  privateCount: number;
}

export interface NoteDTO {
  id: string;
  folderId: string | null;
  title: string;
  /**
   * Plaintext ProseMirror JSON when the note is not private; base64-encoded
   * AES-GCM ciphertext+tag string when {@link encryption} is non-null. The
   * editor branches on `encryption` to decide whether to decrypt before
   * rendering.
   */
  content: PMDoc | string;
  /**
   * Always `''` for private notes — the server does not see plaintext, so it
   * has nothing to mirror. Plaintext notes get the usual flattened body.
   */
  contentText: string;
  encryption: NoteEncryption | null;
  pinned: boolean;
  tagIds: string[];
  trashedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

export type TimeRange = 'today' | 'yesterday' | 'past7' | 'past30';

export type FolderView =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'private' }
  | { kind: 'trash' }
  | { kind: 'time'; range: TimeRange }
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; id: string };

export interface NoteCountsDTO {
  all: number;
  pinned: number;
  trash: number;
  /**
   * Live (non-trashed) notes the user has marked Private. Drives whether
   * the sidebar renders a "Private" row. The sidebar treats `0` as "hide
   * the row" — it only appears once the user actually has a private note.
   */
  private: number;
}

export interface BacklinkDTO {
  /** The note that contains a `[[Title]]` link pointing at the subject note. */
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
}

export function folderViewKey(v: FolderView): string {
  switch (v.kind) {
    case 'all':
    case 'pinned':
    case 'private':
    case 'trash':
      return v.kind;
    case 'time':
      return `time:${v.range}`;
    case 'folder':
      return `folder:${v.id}`;
    case 'tag':
      return `tag:${v.id}`;
  }
}
