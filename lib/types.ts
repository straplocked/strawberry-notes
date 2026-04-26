/**
 * Shared API types for Strawberry Notes. Matches the JSON shape returned by the
 * REST endpoints in app/api/**, consumed by React Query hooks in the client.
 */

export interface FolderDTO {
  id: string;
  name: string;
  color: string;
  position: number;
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
}

/** ProseMirror JSON document. Opaque to the client code outside the editor. */
export interface PMDoc {
  type: 'doc';
  content?: unknown[];
}

export interface NoteDTO {
  id: string;
  folderId: string | null;
  title: string;
  content: PMDoc;
  contentText: string;
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
  | { kind: 'trash' }
  | { kind: 'time'; range: TimeRange }
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; id: string };

export interface NoteCountsDTO {
  all: number;
  pinned: number;
  trash: number;
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
