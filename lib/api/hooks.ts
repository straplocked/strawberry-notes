'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api } from './client';
import { dlog, dtime } from '../debug';
import type {
  BacklinkDTO,
  FolderDTO,
  FolderView,
  NoteCountsDTO,
  NoteDTO,
  NoteListItemDTO,
  PMDoc,
  TagDTO,
} from '../types';
import { folderViewKey } from '../types';

export const qk = {
  folders: ['folders'] as const,
  tags: ['tags'] as const,
  counts: ['noteCounts'] as const,
  notesList: (view: FolderView, q: string) => ['notes', folderViewKey(view), q] as const,
  note: (id: string) => ['note', id] as const,
  backlinks: (id: string) => ['backlinks', id] as const,
  noteTitles: (q: string) => ['noteTitles', q] as const,
};

/** Derived from how `useNotesList` shapes its filter key. */
function viewKeyToKind(viewKey: string): FolderView['kind'] | 'folder-or-tag' {
  if (viewKey === 'all' || viewKey === 'pinned' || viewKey === 'trash') return viewKey;
  return 'folder-or-tag';
}

/** Sort notes list the way the server does (pinned first, then updatedAt desc). */
function sortList(list: NoteListItemDTO[]): NoteListItemDTO[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function useFolders(): UseQueryResult<FolderDTO[]> {
  return useQuery({
    queryKey: qk.folders,
    queryFn: api.folders.list,
    staleTime: 30_000,
  });
}

export function useTags(): UseQueryResult<TagDTO[]> {
  return useQuery({
    queryKey: qk.tags,
    queryFn: api.tags.list,
    staleTime: 30_000,
  });
}

export function useNoteCounts(): UseQueryResult<NoteCountsDTO> {
  return useQuery({
    queryKey: qk.counts,
    queryFn: api.notes.counts,
    staleTime: 30_000,
  });
}

export function useNotesList(view: FolderView, q: string) {
  return useQuery({
    queryKey: qk.notesList(view, q),
    queryFn: () =>
      api.notes.list({
        folder:
          view.kind === 'folder'
            ? view.id
            : view.kind === 'tag'
              ? 'all'
              : view.kind,
        tag: view.kind === 'tag' ? view.id : undefined,
        q: q.trim() || undefined,
      }),
    // Keep prior list visible while the new filter loads (prevents empty flash).
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

/**
 * Lightweight typeahead for the editor's `[[` autocomplete. Backed by
 * `GET /api/notes/titles` — returns up to 20 `{id,title}` pairs filtered by
 * `q`. `enabled` lets the popup consumer switch the query off while the
 * popup is closed so we don't fetch eagerly.
 */
export function useNoteTitles(q: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.noteTitles(q),
    queryFn: () => api.notes.titles(q),
    enabled,
    placeholderData: keepPreviousData,
    // Titles list changes infrequently — a longer stale window keeps the
    // popup snappy while the user types.
    staleTime: 15_000,
  });
}

export function useNote(id: string | null) {
  return useQuery({
    queryKey: id ? qk.note(id) : ['note', 'none'],
    queryFn: () => (id ? api.notes.get(id) : Promise.reject(new Error('no id'))),
    enabled: !!id,
    // Prevents the editor from flashing to its empty state while switching notes.
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useBacklinks(id: string | null): UseQueryResult<BacklinkDTO[]> {
  return useQuery({
    queryKey: id ? qk.backlinks(id) : ['backlinks', 'none'],
    queryFn: () => (id ? api.notes.backlinks(id) : Promise.reject(new Error('no id'))),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ---------- Helpers: walk all notes-list caches and apply a transform ----------

type ListEntry = { key: QueryKey; data: NoteListItemDTO[] };

interface ListContext {
  prevLists: ListEntry[];
  prevFolders?: FolderDTO[];
  prevNote?: NoteDTO;
}

function snapshotLists(qc: ReturnType<typeof useQueryClient>): ListEntry[] {
  const entries = qc.getQueriesData<NoteListItemDTO[]>({ queryKey: ['notes'] });
  return entries
    .filter(([, data]) => Array.isArray(data))
    .map(([key, data]) => ({ key, data: data as NoteListItemDTO[] }));
}

function restoreLists(qc: ReturnType<typeof useQueryClient>, prev: ListEntry[]) {
  prev.forEach(({ key, data }) => qc.setQueryData(key, data));
}

/** Apply a mapper/filter to every cached notes list. */
function patchAllLists(
  qc: ReturnType<typeof useQueryClient>,
  transform: (list: NoteListItemDTO[], viewKey: string) => NoteListItemDTO[],
) {
  const entries = qc.getQueriesData<NoteListItemDTO[]>({ queryKey: ['notes'] });
  entries.forEach(([key, data]) => {
    if (!Array.isArray(data)) return;
    const viewKey = (key as unknown[])[1];
    const next = transform(data, typeof viewKey === 'string' ? viewKey : '');
    qc.setQueryData(key, next);
  });
}

// ---------- Mutations ----------

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.notes.create,
    onMutate: async (input) => {
      dlog('mut', 'createNote:onMutate', input);
      await qc.cancelQueries({ queryKey: ['notes'] });
      const prevLists = snapshotLists(qc);
      const prevFolders = qc.getQueryData<FolderDTO[]>(qk.folders);

      const tempId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date().toISOString();
      const optimistic: NoteListItemDTO = {
        id: tempId,
        folderId: input.folderId ?? null,
        title: input.title ?? '',
        snippet: '',
        pinned: false,
        updatedAt: now,
        tagIds: [],
        hasImage: false,
      };

      // Walk all `['notes', viewKey, q]` entries — skip those with an active search.
      const entries = qc.getQueriesData<NoteListItemDTO[]>({ queryKey: ['notes'] });
      entries.forEach(([key, data]) => {
        if (!Array.isArray(data)) return;
        const parts = key as unknown[];
        const viewKey = typeof parts[1] === 'string' ? parts[1] : '';
        const q = typeof parts[2] === 'string' ? parts[2] : '';
        if (q) return; // don't fake-insert into a filtered search result
        const kind = viewKeyToKind(viewKey);
        if (kind === 'trash' || kind === 'pinned') return;
        if (kind === 'folder-or-tag' && viewKey.startsWith('folder:')) {
          const fid = viewKey.slice('folder:'.length);
          if (optimistic.folderId !== fid) return;
        }
        if (kind === 'folder-or-tag' && viewKey.startsWith('tag:')) return;
        qc.setQueryData(key, sortList([optimistic, ...data]));
      });

      if (prevFolders && optimistic.folderId) {
        qc.setQueryData<FolderDTO[]>(
          qk.folders,
          prevFolders.map((f) =>
            f.id === optimistic.folderId ? { ...f, count: f.count + 1 } : f,
          ),
        );
      }

      return { prevLists, prevFolders, tempId } as ListContext & { tempId: string };
    },
    onError: (err, _input, ctx) => {
      dlog('mut', 'createNote:error', err);
      if (ctx) {
        restoreLists(qc, ctx.prevLists);
        if (ctx.prevFolders) qc.setQueryData(qk.folders, ctx.prevFolders);
      }
    },
    onSuccess: (note, _input, ctx) => {
      dlog('mut', 'createNote:success', { id: note.id });
      qc.invalidateQueries({ queryKey: qk.counts });
      const tempId = (ctx as { tempId?: string } | undefined)?.tempId;
      if (!tempId) return;
      // Swap temp id for real id in every cached list
      patchAllLists(qc, (list) =>
        list.map((n) =>
          n.id === tempId
            ? {
                id: note.id,
                folderId: note.folderId,
                title: note.title,
                snippet: '',
                pinned: note.pinned,
                updatedAt: note.updatedAt,
                tagIds: note.tagIds,
                hasImage: false,
              }
            : n,
        ),
      );
      qc.setQueryData<NoteDTO>(qk.note(note.id), note);
    },
  });
}

type PatchInput = Parameters<typeof api.notes.patch>[1];

export function usePatchNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchInput }) =>
      api.notes.patch(id, patch),
    onMutate: async ({ id, patch }) => {
      dlog('mut', 'patchNote:onMutate', { id, keys: Object.keys(patch) });
      // Cancel only the single-note query. `patchAllLists` below applies the
      // optimistic update in-place to every cached notes list; cancelling every
      // list query on top of that just throws away in-flight refetches (e.g.
      // the user switched folder mid-autosave) for no gain.
      await qc.cancelQueries({ queryKey: qk.note(id) });

      const prevNote = qc.getQueryData<NoteDTO>(qk.note(id));
      const prevLists = snapshotLists(qc);
      const prevFolders = qc.getQueryData<FolderDTO[]>(qk.folders);

      const now = new Date().toISOString();

      // 1) Patch the single-note cache.
      if (prevNote) {
        const nextNote: NoteDTO = {
          ...prevNote,
          title: patch.title ?? prevNote.title,
          content: (patch.content as PMDoc | undefined) ?? prevNote.content,
          folderId:
            patch.folderId !== undefined ? patch.folderId : prevNote.folderId,
          pinned: patch.pinned ?? prevNote.pinned,
          trashedAt:
            patch.trashed === true
              ? now
              : patch.trashed === false
                ? null
                : prevNote.trashedAt,
          updatedAt: now,
        };
        qc.setQueryData(qk.note(id), nextNote);
      }

      // 2) Patch every notes list. Mutate in place; may remove if trashed/untrashed.
      patchAllLists(qc, (list, viewKey) => {
        const kind = viewKeyToKind(viewKey);
        let next = list.map((n) => {
          if (n.id !== id) return n;
          return {
            ...n,
            title: patch.title ?? n.title,
            pinned: patch.pinned ?? n.pinned,
            folderId:
              patch.folderId !== undefined ? patch.folderId : n.folderId,
            updatedAt: now,
          };
        });

        // Soft-trash: drop from non-trash lists. Restore: drop from trash list.
        if (patch.trashed === true && kind !== 'trash') {
          next = next.filter((n) => n.id !== id);
        }
        if (patch.trashed === false && kind === 'trash') {
          next = next.filter((n) => n.id !== id);
        }

        // If pinned flipped and we're on Pinned view, a newly unpinned note leaves.
        if (patch.pinned === false && kind === 'pinned') {
          next = next.filter((n) => n.id !== id);
        }

        // If folder changed and this list is a specific folder view, remove if no longer matches.
        if (patch.folderId !== undefined && viewKey.startsWith('folder:')) {
          const fid = viewKey.slice('folder:'.length);
          if (patch.folderId !== fid) {
            next = next.filter((n) => n.id !== id);
          }
        }

        if (patch.pinned !== undefined || patch.title !== undefined) {
          next = sortList(next);
        }
        return next;
      });

      // 3) Adjust folder counts if folderId or trashed changed.
      if (prevFolders && (patch.folderId !== undefined || patch.trashed !== undefined)) {
        const before = prevNote?.folderId ?? null;
        const beforeTrashed = !!prevNote?.trashedAt;
        const afterTrashed =
          patch.trashed !== undefined ? patch.trashed : beforeTrashed;
        const after =
          patch.folderId !== undefined ? patch.folderId : before;
        // Skip the setQueryData write entirely when the target isn't a real
        // folder (null = unfiled). Clamp at 0 so a stale `prevNote` that leads
        // to an over-decrement can never display a negative count.
        const delta = (fid: string | null, sign: 1 | -1) => {
          if (!fid) return;
          qc.setQueryData<FolderDTO[]>(qk.folders, (fs) =>
            (fs ?? []).map((f) => {
              if (f.id !== fid) return f;
              const next = Math.max(0, f.count + sign);
              dlog('mut', 'folder count delta', {
                folderId: fid,
                name: f.name,
                from: f.count,
                to: next,
                sign,
              });
              return { ...f, count: next };
            }),
          );
        };
        if (beforeTrashed !== afterTrashed) {
          // Going into trash → decrement old folder count; leaving trash → increment current folder.
          if (afterTrashed) delta(before, -1);
          else delta(after, +1);
        } else if (!beforeTrashed && before !== after) {
          delta(before, -1);
          delta(after, +1);
        }
      }

      return { prevLists, prevFolders, prevNote } satisfies ListContext;
    },
    onError: (err, { id }, ctx) => {
      dlog('mut', 'patchNote:error', err);
      if (!ctx) return;
      if (ctx.prevNote) qc.setQueryData(qk.note(id), ctx.prevNote);
      restoreLists(qc, ctx.prevLists);
      if (ctx.prevFolders) qc.setQueryData(qk.folders, ctx.prevFolders);
    },
    onSuccess: (note, { patch }) => {
      dlog('mut', 'patchNote:success', { id: note.id });
      // Canonicalize the single-note cache with the server's response.
      qc.setQueryData(qk.note(note.id), note);
      // If this patch could have touched folder counts, reconcile with the
      // server. Optimistic math can drift (e.g. moving a note whose single-
      // note cache was never populated), and the folders list is tiny.
      if (patch.folderId !== undefined || patch.trashed !== undefined) {
        qc.invalidateQueries({ queryKey: qk.folders });
      }
      // Top-level counts depend on pinned / trashed state.
      if (patch.pinned !== undefined || patch.trashed !== undefined) {
        qc.invalidateQueries({ queryKey: qk.counts });
      }
      // patchAllLists only removes notes from lists they no longer belong to;
      // it never *adds* a note that newly qualifies (pin=true → Pinned view,
      // folder=X → notes:folder:X). Invalidate to let the server-side
      // WHERE clauses rebuild any list whose membership may have changed.
      if (
        patch.pinned !== undefined ||
        patch.trashed !== undefined ||
        patch.folderId !== undefined
      ) {
        qc.invalidateQueries({ queryKey: ['notes'] });
      }
      // A content or title change can add/remove inbound links to other notes.
      // Broadcast-invalidate — the backlinks query is only mounted for the
      // currently-open note, so this is effectively a single refetch.
      if (patch.content !== undefined || patch.title !== undefined) {
        qc.invalidateQueries({ queryKey: ['backlinks'] });
      }
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notes.remove(id),
    onMutate: async (id) => {
      dlog('mut', 'deleteNote:onMutate', { id });
      await qc.cancelQueries({ queryKey: ['notes'] });
      const prevLists = snapshotLists(qc);
      const prevFolders = qc.getQueryData<FolderDTO[]>(qk.folders);
      const prevNote = qc.getQueryData<NoteDTO>(qk.note(id));

      patchAllLists(qc, (list) => list.filter((n) => n.id !== id));

      // If the note was live (not already trashed) in a folder, decrement its folder count.
      if (prevFolders && prevNote && !prevNote.trashedAt && prevNote.folderId) {
        qc.setQueryData<FolderDTO[]>(
          qk.folders,
          prevFolders.map((f) =>
            f.id === prevNote.folderId ? { ...f, count: Math.max(0, f.count - 1) } : f,
          ),
        );
      }

      qc.removeQueries({ queryKey: qk.note(id) });

      return { prevLists, prevFolders, prevNote } satisfies ListContext;
    },
    onError: (err, id, ctx) => {
      dlog('mut', 'deleteNote:error', err);
      if (!ctx) return;
      restoreLists(qc, ctx.prevLists);
      if (ctx.prevFolders) qc.setQueryData(qk.folders, ctx.prevFolders);
      if (ctx.prevNote) qc.setQueryData(qk.note(id), ctx.prevNote);
    },
    onSuccess: () => {
      dlog('mut', 'deleteNote:success');
      qc.invalidateQueries({ queryKey: qk.folders });
      qc.invalidateQueries({ queryKey: qk.counts });
    },
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.folders.create,
    onMutate: async (input) => {
      dlog('mut', 'createFolder:onMutate', input);
      await qc.cancelQueries({ queryKey: qk.folders });
      const prevFolders = qc.getQueryData<FolderDTO[]>(qk.folders);
      const tempId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
      const optimistic: FolderDTO = {
        id: tempId,
        name: input.name,
        color: input.color ?? 'var(--ink-4)',
        position: (prevFolders?.length ?? 0) + 1,
        count: 0,
      };
      qc.setQueryData<FolderDTO[]>(qk.folders, [...(prevFolders ?? []), optimistic]);
      return { prevFolders, tempId };
    },
    onError: (err, _input, ctx) => {
      dlog('mut', 'createFolder:error', err);
      if (ctx?.prevFolders) qc.setQueryData(qk.folders, ctx.prevFolders);
    },
    onSuccess: (folder, _input, ctx) => {
      dlog('mut', 'createFolder:success', { id: folder.id });
      qc.setQueryData<FolderDTO[]>(qk.folders, (fs) =>
        (fs ?? []).map((f) => (f.id === ctx?.tempId ? folder : f)),
      );
    },
  });
}

export function usePatchFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: string; position?: number } }) =>
      api.folders.patch(id, patch),
    onMutate: async ({ id, patch }) => {
      dlog('mut', 'patchFolder:onMutate', { id, patch });
      await qc.cancelQueries({ queryKey: qk.folders });
      const prevFolders = qc.getQueryData<FolderDTO[]>(qk.folders);
      qc.setQueryData<FolderDTO[]>(qk.folders, (fs) =>
        (fs ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
      return { prevFolders };
    },
    onError: (err, _vars, ctx) => {
      dlog('mut', 'patchFolder:error', err);
      if (ctx?.prevFolders) qc.setQueryData(qk.folders, ctx.prevFolders);
    },
    onSuccess: (folder) => {
      dlog('mut', 'patchFolder:success', { id: folder.id });
      // Server doesn't return `count`; merge with whatever is in cache.
      qc.setQueryData<FolderDTO[]>(qk.folders, (fs) =>
        (fs ?? []).map((f) => (f.id === folder.id ? { ...f, ...folder } : f)),
      );
    },
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.folders.delete(id),
    onMutate: async (id) => {
      dlog('mut', 'deleteFolder:onMutate', { id });
      await qc.cancelQueries({ queryKey: qk.folders });
      await qc.cancelQueries({ queryKey: ['notes'] });
      const prevFolders = qc.getQueryData<FolderDTO[]>(qk.folders);
      const prevLists = snapshotLists(qc);

      qc.setQueryData<FolderDTO[]>(qk.folders, (fs) =>
        (fs ?? []).filter((f) => f.id !== id),
      );

      // The server sets folderId to null on affected notes (ON DELETE SET NULL).
      // Remove them from any folder-scoped list; otherwise null out folderId.
      patchAllLists(qc, (list, viewKey) => {
        if (viewKey === `folder:${id}`) {
          return list.filter((n) => n.folderId !== id);
        }
        return list.map((n) => (n.folderId === id ? { ...n, folderId: null } : n));
      });

      return { prevFolders, prevLists };
    },
    onError: (err, _id, ctx) => {
      dlog('mut', 'deleteFolder:error', err);
      if (ctx?.prevFolders) qc.setQueryData(qk.folders, ctx.prevFolders);
      if (ctx?.prevLists) restoreLists(qc, ctx.prevLists);
    },
    onSuccess: () => {
      dlog('mut', 'deleteFolder:success');
    },
  });
}

// Re-export for any module that imported it transitively.
export { type NoteListItemDTO };

// Wrap dtime so AppShell etc. can time click-to-paint latency.
export { dtime, dlog };
