'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Sidebar } from './Sidebar';
import { NoteList } from './NoteList';
import { Editor } from './Editor';
import { TweaksPanel } from './Tweaks';
import { useUIStore } from '@/lib/store/ui-store';
import {
  useCreateFolder,
  useCreateNote,
  useDeleteFolder,
  useDeleteNote,
  useFolders,
  useNote,
  useNoteCounts,
  useNotesList,
  usePatchNote,
  useTags,
} from '@/lib/api/hooks';
import { dlog, drender, dtime } from '@/lib/debug';
import type { FolderDTO, PMDoc } from '@/lib/types';

export function AppShell() {
  const router = useRouter();
  const {
    view,
    setView,
    activeNoteId,
    setActiveNoteId,
    search,
    setSearch,
    settings,
    setTheme,
  } = useUIStore();

  const foldersQ = useFolders();
  const tagsQ = useTags();
  const countsQ = useNoteCounts();
  const notesListQ = useNotesList(view, search);
  const noteQ = useNote(activeNoteId);

  const createNote = useCreateNote();
  const patchNote = usePatchNote();
  const deleteNote = useDeleteNote();
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();

  drender('AppShell', {
    view: view.kind,
    activeNoteId,
    noteLoaded: !!noteQ.data,
    noteStatus: noteQ.status,
    listCount: notesListQ.data?.length ?? 0,
    listStatus: notesListQ.status,
  });

  const folders = useMemo(() => foldersQ.data ?? [], [foldersQ.data]);
  const tags = useMemo(() => tagsQ.data ?? [], [tagsQ.data]);
  const listNotes = useMemo(() => notesListQ.data ?? [], [notesListQ.data]);
  const counts = countsQ.data;

  // Keep the active note valid as the list changes.
  useEffect(() => {
    dlog('effect', 'AppShell: list/active reconcile', {
      listCount: listNotes.length,
      activeNoteId,
    });
    if (listNotes.length === 0) {
      if (activeNoteId) setActiveNoteId(null);
      return;
    }
    if (!activeNoteId || !listNotes.some((n) => n.id === activeNoteId)) {
      dlog('effect', 'AppShell: auto-selecting first note', { id: listNotes[0].id });
      setActiveNoteId(listNotes[0].id);
    }
  }, [listNotes, activeNoteId, setActiveNoteId]);

  // Log note fetch round-trip end to correlate with the click-to-select log.
  useEffect(() => {
    if (activeNoteId) dlog('ui', 'activeNoteId ->', { id: activeNoteId });
  }, [activeNoteId]);

  useEffect(() => {
    if (noteQ.data) dlog('ui', 'note loaded', { id: noteQ.data.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteQ.data?.id]);

  const activeFolderName = useMemo(() => {
    if (search.trim()) return 'Search';
    switch (view.kind) {
      case 'all':
        return 'All Notes';
      case 'pinned':
        return 'Pinned';
      case 'trash':
        return 'Trash';
      case 'folder':
        return folders.find((f) => f.id === view.id)?.name ?? 'Folder';
      case 'tag':
        return `#${tags.find((t) => t.id === view.id)?.name ?? 'tag'}`;
    }
  }, [view, folders, tags, search]);

  const activeNote = noteQ.data ?? null;
  const activeNoteFolder = activeNote
    ? folders.find((f) => f.id === activeNote.folderId) ?? null
    : null;
  const activeNoteTags = (activeNote?.tagIds ?? [])
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);

  // Debounced autosave. Content is pulled from the live editor at save time,
  // so we don't serialize the doc on every keystroke.
  const pendingRef = useRef<{ title?: string; contentDirty?: boolean }>({});
  const timerRef = useRef<number | null>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const scheduleSave = (id: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const pending = pendingRef.current;
      pendingRef.current = {};
      const patch: { title?: string; content?: PMDoc } = {};
      if (pending.title !== undefined) patch.title = pending.title;
      if (pending.contentDirty && editorRef.current) {
        patch.content = editorRef.current.getJSON() as PMDoc;
      }
      if (Object.keys(patch).length > 0) {
        dlog('save', 'autosave fire', { id, fields: Object.keys(patch) });
        patchNote.mutate({ id, patch });
      } else {
        dlog('save', 'autosave noop', { id });
      }
    }, 700);
  };

  // Hotkeys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onNewNote();
      }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[placeholder="Search notes"]');
        input?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function onNewNote() {
    const t = dtime('ui', 'click: new note');
    // Apple-Notes style: only attach to a folder when the user is viewing one.
    // All Notes / Pinned / Trash / Tag views create an unfiled note.
    const folderId = view.kind === 'folder' ? view.id : null;
    createNote.mutate(
      { folderId, title: '' },
      {
        onSuccess: (n) => {
          setActiveNoteId(n.id);
          t.end({ id: n.id });
        },
        onError: (err) => t.end({ error: (err as Error).message }),
      },
    );
  }

  function onAddFolder(input: { name: string; color: string }) {
    dlog('ui', 'click: add folder', input);
    createFolder.mutate(input);
  }

  function onDeleteFolder(folder: FolderDTO) {
    const ok = window.confirm(
      `Delete folder "${folder.name}"? Notes in this folder will move to All Notes.`,
    );
    if (!ok) return;
    dlog('ui', 'click: delete folder', { id: folder.id, name: folder.name });
    deleteFolder.mutate(folder.id, {
      onSuccess: () => {
        if (view.kind === 'folder' && view.id === folder.id) {
          setView({ kind: 'all' });
        }
      },
    });
  }

  function onTrashNote() {
    if (!activeNote) return;
    dlog('ui', 'click: trash note', { id: activeNote.id });
    patchNote.mutate({ id: activeNote.id, patch: { trashed: true } });
  }

  function onRestoreNote() {
    if (!activeNote) return;
    dlog('ui', 'click: restore note', { id: activeNote.id });
    patchNote.mutate({ id: activeNote.id, patch: { trashed: false } });
  }

  function onDeleteForever() {
    if (!activeNote) return;
    const ok = window.confirm(
      `Delete "${activeNote.title || 'Untitled'}" forever? This cannot be undone.`,
    );
    if (!ok) return;
    dlog('ui', 'click: delete forever', { id: activeNote.id });
    deleteNote.mutate(activeNote.id);
  }

  function onTogglePinActive() {
    if (!activeNote) return;
    dlog('ui', 'click: toggle pin', { id: activeNote.id, next: !activeNote.pinned });
    patchNote.mutate({ id: activeNote.id, patch: { pinned: !activeNote.pinned } });
  }

  function onSelectNote(id: string) {
    dlog('ui', 'click: select note', { id });
    setActiveNoteId(id);
  }

  function onMoveNoteToFolder(noteId: string, folderId: string | null) {
    dlog('ui', 'drop: move note', { noteId, folderId });
    patchNote.mutate({ id: noteId, patch: { folderId } });
  }

  async function onSignOut() {
    const t = dtime('ui', 'click: sign out');
    await signOut({ redirect: false });
    router.push('/login');
    router.refresh();
    t.end();
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      {!settings.sidebarHidden && (
        <Sidebar
          folders={folders}
          tags={tags}
          allCount={counts?.all ?? 0}
          pinnedCount={counts?.pinned ?? 0}
          trashCount={counts?.trash ?? 0}
          view={view}
          onView={setView}
          onNew={onNewNote}
          theme={settings.theme}
          onToggleTheme={() => setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
          density={settings.density}
          onAddFolder={onAddFolder}
          onDeleteFolder={onDeleteFolder}
          onSignOut={onSignOut}
          onMoveNoteToFolder={onMoveNoteToFolder}
        />
      )}
      <NoteList
        notes={listNotes}
        tags={tags}
        activeFolderName={activeFolderName}
        activeNoteId={activeNoteId}
        onSelect={onSelectNote}
        search={search}
        onSearch={setSearch}
        density={settings.density}
      />
      <Editor
        note={activeNote}
        folder={activeNoteFolder}
        tags={activeNoteTags}
        editorRef={editorRef}
        onChangeTitle={(title) => {
          if (!activeNoteId) return;
          pendingRef.current.title = title;
          scheduleSave(activeNoteId);
        }}
        onDirty={() => {
          if (!activeNoteId) return;
          pendingRef.current.contentDirty = true;
          scheduleSave(activeNoteId);
        }}
        onTogglePin={onTogglePinActive}
        onTrash={onTrashNote}
        onRestore={onRestoreNote}
        onDeleteForever={onDeleteForever}
      />
      <TweaksPanel />
    </div>
  );
}
