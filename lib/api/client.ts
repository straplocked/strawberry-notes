import { dtime } from '../debug';
import type {
  BacklinkDTO,
  FolderDTO,
  NoteCountsDTO,
  NoteDTO,
  NoteListItemDTO,
  PMDoc,
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
    create: (input: { name: string; color?: string }) =>
      req<FolderDTO>('POST', '/api/folders', {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    patch: (id: string, input: { name?: string; color?: string; position?: number }) =>
      req<FolderDTO>('PATCH', `/api/folders/${id}`, {
        headers: jsonHeaders,
        body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      req<{ ok: true }>('DELETE', `/api/folders/${id}`),
  },
  tags: {
    list: () => req<TagDTO[]>('GET', '/api/tags'),
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
};
