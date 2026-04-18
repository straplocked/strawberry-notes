import type { FolderDTO, NoteDTO, NoteListItemDTO, PMDoc, TagDTO } from '../types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ''}`);
  }
  return (await res.json()) as T;
}

export const api = {
  folders: {
    list: () => fetch('/api/folders').then((r) => json<FolderDTO[]>(r)),
    create: (input: { name: string; color?: string }) =>
      fetch('/api/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => json<FolderDTO>(r)),
    delete: (id: string) =>
      fetch(`/api/folders/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r)),
  },
  tags: {
    list: () => fetch('/api/tags').then((r) => json<TagDTO[]>(r)),
  },
  notes: {
    list: (params: { folder?: string; tag?: string; q?: string }) => {
      const search = new URLSearchParams();
      if (params.folder) search.set('folder', params.folder);
      if (params.tag) search.set('tag', params.tag);
      if (params.q) search.set('q', params.q);
      return fetch(`/api/notes?${search.toString()}`).then((r) => json<NoteListItemDTO[]>(r));
    },
    get: (id: string) => fetch(`/api/notes/${id}`).then((r) => json<NoteDTO>(r)),
    create: (input: { folderId?: string | null; title?: string; tagNames?: string[] }) =>
      fetch('/api/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => json<NoteDTO>(r)),
    patch: (
      id: string,
      input: {
        title?: string;
        content?: PMDoc;
        folderId?: string | null;
        pinned?: boolean;
        tagNames?: string[];
        trashed?: boolean;
      },
    ) =>
      fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => json<NoteDTO>(r)),
    remove: (id: string) =>
      fetch(`/api/notes/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r)),
    exportMarkdown: (id: string) => (window.location.href = `/api/notes/${id}/export.md`),
  },
};
