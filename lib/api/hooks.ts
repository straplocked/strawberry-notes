'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api } from './client';
import type { FolderDTO, FolderView, NoteDTO, NoteListItemDTO, PMDoc, TagDTO } from '../types';
import { folderViewKey } from '../types';

export const qk = {
  folders: ['folders'] as const,
  tags: ['tags'] as const,
  notesList: (view: FolderView, q: string) => ['notes', folderViewKey(view), q] as const,
  note: (id: string) => ['note', id] as const,
};

export function useFolders(): UseQueryResult<FolderDTO[]> {
  return useQuery({ queryKey: qk.folders, queryFn: api.folders.list });
}

export function useTags(): UseQueryResult<TagDTO[]> {
  return useQuery({ queryKey: qk.tags, queryFn: api.tags.list });
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
  });
}

export function useNote(id: string | null) {
  return useQuery({
    queryKey: id ? qk.note(id) : ['note', 'none'],
    queryFn: () => (id ? api.notes.get(id) : Promise.reject(new Error('no id'))),
    enabled: !!id,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.notes.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      qc.invalidateQueries({ queryKey: qk.folders });
    },
  });
}

export function usePatchNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.notes.patch>[1] }) =>
      api.notes.patch(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.note(id) });
      const prev = qc.getQueryData<NoteDTO>(qk.note(id));
      if (prev) {
        const next: NoteDTO = {
          ...prev,
          title: patch.title ?? prev.title,
          content: (patch.content as PMDoc | undefined) ?? prev.content,
          folderId: patch.folderId !== undefined ? patch.folderId : prev.folderId,
          pinned: patch.pinned ?? prev.pinned,
          updatedAt: new Date().toISOString(),
        };
        qc.setQueryData(qk.note(id), next);
      }
      return { prev };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.note(id), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      qc.invalidateQueries({ queryKey: qk.folders });
      qc.invalidateQueries({ queryKey: qk.tags });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notes.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      qc.invalidateQueries({ queryKey: qk.folders });
    },
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.folders.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.folders }),
  });
}

export { type NoteListItemDTO };
