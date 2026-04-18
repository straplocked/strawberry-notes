'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Sidebar } from './Sidebar';
import { NoteList } from './NoteList';
import { Editor } from './Editor';
import { TweaksPanel } from './Tweaks';
import { useUIStore } from '@/lib/store/ui-store';
import {
  useCreateNote,
  useFolders,
  useNote,
  useNotesList,
  usePatchNote,
  useTags,
} from '@/lib/api/hooks';
import type { PMDoc } from '@/lib/types';

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
  const notesListQ = useNotesList(view, search);
  const noteQ = useNote(activeNoteId);

  const createNote = useCreateNote();
  const patchNote = usePatchNote();

  const folders = useMemo(() => foldersQ.data ?? [], [foldersQ.data]);
  const tags = useMemo(() => tagsQ.data ?? [], [tagsQ.data]);
  const listNotes = useMemo(() => notesListQ.data ?? [], [notesListQ.data]);

  // Keep the active note valid as the list changes.
  useEffect(() => {
    if (listNotes.length === 0) {
      if (activeNoteId) setActiveNoteId(null);
      return;
    }
    if (!activeNoteId || !listNotes.some((n) => n.id === activeNoteId)) {
      setActiveNoteId(listNotes[0].id);
    }
  }, [listNotes, activeNoteId, setActiveNoteId]);

  const totalAll = useMemo(() => folders.reduce((sum, f) => sum + f.count, 0), [folders]);

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

  // Debounced autosave for title + content edits.
  const pendingRef = useRef<{ title?: string; content?: PMDoc }>({});
  const timerRef = useRef<number | null>(null);
  const scheduleSave = (id: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const patch = pendingRef.current;
      pendingRef.current = {};
      if (Object.keys(patch).length > 0) {
        patchNote.mutate({ id, patch });
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
    const folderId =
      view.kind === 'folder' ? view.id : folders[0]?.id ?? null;
    createNote.mutate(
      { folderId, title: '' },
      {
        onSuccess: (n) => {
          setActiveNoteId(n.id);
        },
      },
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      {!settings.sidebarHidden && (
        <Sidebar
          folders={folders}
          tags={tags}
          allCount={view.kind === 'all' ? listNotes.length : totalAll}
          pinnedCount={view.kind === 'pinned' ? listNotes.length : 0}
          trashCount={view.kind === 'trash' ? listNotes.length : 0}
          view={view}
          onView={setView}
          onNew={onNewNote}
          theme={settings.theme}
          onToggleTheme={() => setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
          density={settings.density}
        />
      )}
      <NoteList
        notes={listNotes}
        tags={tags}
        activeFolderName={activeFolderName}
        activeNoteId={activeNoteId}
        onSelect={setActiveNoteId}
        search={search}
        onSearch={setSearch}
        density={settings.density}
      />
      <Editor
        note={activeNote}
        folder={activeNoteFolder}
        tags={activeNoteTags}
        onChangeTitle={(title) => {
          if (!activeNoteId) return;
          pendingRef.current.title = title;
          scheduleSave(activeNoteId);
        }}
        onChangeContent={(doc) => {
          if (!activeNoteId) return;
          pendingRef.current.content = doc;
          scheduleSave(activeNoteId);
        }}
        onTogglePin={() => {
          if (!activeNote) return;
          patchNote.mutate({ id: activeNote.id, patch: { pinned: !activeNote.pinned } });
        }}
      />
      <button
        onClick={async () => {
          await signOut({ redirect: false });
          router.push('/login');
          router.refresh();
        }}
        style={{
          position: 'fixed',
          top: 10,
          right: 18,
          background: 'transparent',
          border: '1px solid var(--hair)',
          color: 'var(--ink-3)',
          padding: '4px 10px',
          borderRadius: 7,
          fontSize: 11,
          cursor: 'pointer',
        }}
        title="Sign out"
        type="button"
      >
        Sign out
      </button>
      <TweaksPanel />
    </div>
  );
}
