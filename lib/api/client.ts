import { dtime } from '../debug';
import type {
  BacklinkDTO,
  FolderDTO,
  NoteCountsDTO,
  NoteDTO,
  NoteEncryption,
  NoteListItemDTO,
  PMDoc,
  PrivateNotesMaterial,
  PrivateNotesStatus,
  PrivateNotesWrapBlob,
  TagDTO,
} from '../types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ''}`);
  }
  return (await res.json()) as T;
}

async function req<T>(
  method: string,
  url: string,
  init?: RequestInit,
  parseJson: boolean = true,
): Promise<T> {
  const t = dtime('net', `${method} ${url}`);
  try {
    const res = await fetch(url, { method, ...init });
    const out = parseJson ? await json<T>(res) : (undefined as unknown as T);
    t.end({ status: res.status });
    return out;
  } catch (err) {
    t.end({ error: (err as Error).message });
    throw err;
  }
}

const jsonHeaders = { 'content-type': 'application/json' } as const;

export const api = {
  folders: {
    list: () => req<FolderDTO[]>('GET', '/api/folders'),
    create: (input: { name: string; color?: string; parentId?: string | null }) =>
      req<FolderDTO>('POST', '/api/folders', {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    patch: (
      id: string,
      input: { name?: string; color?: string; position?: number; parentId?: string | null },
    ) =>
      req<FolderDTO>('PATCH', `/api/folders/${id}`, {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      req<{ ok: true }>('DELETE', `/api/folders/${id}`),
  },
  tags: {
    list: () => req<TagDTO[]>('GET', '/api/tags'),
    /**
     * Rename or merge. Server returns `{ id, merged }`: `id` is the surviving
     * tag (same as input on a pure rename, the existing tag's id on merge),
     * `merged` is true when the new name collided with an existing tag and
     * its memberships got rewritten to the existing one.
     */
    patch: (id: string, input: { name: string }) =>
      req<{ id: string; merged: boolean }>('PATCH', `/api/tags/${id}`, {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    delete: (id: string) => req<{ ok: true }>('DELETE', `/api/tags/${id}`),
  },
  notes: {
    counts: () => req<NoteCountsDTO>('GET', '/api/notes/counts'),
    list: (params: { folder?: string; tag?: string; q?: string }) => {
      const search = new URLSearchParams();
      if (params.folder) search.set('folder', params.folder);
      if (params.tag) search.set('tag', params.tag);
      if (params.q) search.set('q', params.q);
      return req<NoteListItemDTO[]>('GET', `/api/notes?${search.toString()}`);
    },
    titles: (q: string) => {
      const search = new URLSearchParams();
      if (q) search.set('q', q);
      const qs = search.toString();
      return req<{ id: string; title: string }[]>(
        'GET',
        qs ? `/api/notes/titles?${qs}` : '/api/notes/titles',
      );
    },
    get: (id: string) => req<NoteDTO>('GET', `/api/notes/${id}`),
    create: (input: { folderId?: string | null; title?: string; tagNames?: string[] }) =>
      req<NoteDTO>('POST', '/api/notes', {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    patch: (
      id: string,
      input: {
        title?: string;
        content?: PMDoc;
        folderId?: string | null;
        pinned?: boolean;
        tagNames?: string[];
        trashed?: boolean;
        /**
         * Private Notes transition control:
         *   - `undefined`  → no change to privacy state
         *   - `NoteEncryption` → transition to / re-save private; `ciphertext` is required
         *   - `null`       → explicit private→plaintext; `content` (a real PMDoc) is required
         */
        encryption?: NoteEncryption | null;
        /** Required when `encryption` is a non-null object. Base64 AES-GCM ciphertext+tag. */
        ciphertext?: string;
      },
    ) =>
      req<NoteDTO>('PATCH', `/api/notes/${id}`, {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      req<{ ok: true }>('DELETE', `/api/notes/${id}`),
    exportMarkdown: (id: string) => (window.location.href = `/api/notes/${id}/export.md`),
    backlinks: (id: string) => req<BacklinkDTO[]>('GET', `/api/notes/${id}/backlinks`),
  },
  privateNotes: {
    /** Lightweight status for the Settings banner. Always succeeds for a signed-in user. */
    status: () => req<PrivateNotesStatus>('GET', '/api/private-notes'),
    /**
     * Returns the wrap envelopes + KDF parameters needed to derive the
     * unwrapping KEK in the browser. Throws on 404 when the user has not
     * configured Private Notes yet.
     */
    getWrap: () => req<PrivateNotesMaterial>('GET', '/api/private-notes/wrap'),
    /** First-time setup. Server stores both wraps. 409 on second call. */
    setup: (input: {
      passphraseWrap: PrivateNotesWrapBlob;
      recoveryWrap: PrivateNotesWrapBlob;
    }) =>
      req<PrivateNotesMaterial>('POST', '/api/private-notes/setup', {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    /** Replace the passphrase wrap (after the user typed in a new passphrase). */
    changePassphrase: (input: { passphraseWrap: PrivateNotesWrapBlob }) =>
      req<{ ok: true }>('PATCH', '/api/private-notes/passphrase', {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    /** Replace the recovery-code wrap (after the client generated a new code). */
    regenerateRecovery: (input: { recoveryWrap: PrivateNotesWrapBlob }) =>
      req<{ ok: true }>('POST', '/api/private-notes/recovery', {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    /**
     * Disable the feature. Server refuses with 409 when any private note still
     * exists — the caller is expected to surface the count + ask the user to
     * migrate them back to plaintext first.
     */
    disable: () => req<{ ok: true }>('DELETE', '/api/private-notes'),
  },
};
