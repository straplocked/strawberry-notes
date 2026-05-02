'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { timeRangeLabel } from '@/lib/notes/time-range';
import { Sidebar } from './Sidebar';
import { NoteList } from './NoteList';
import { Editor } from './Editor';
import { TweaksPanel } from './Tweaks';
import { MobileTopBar, type MobilePane } from './MobileTopBar';
import { PaneResizer } from './PaneResizer';
import { ConfirmDialog } from './ConfirmDialog';
import { ActionSheet, type ActionSheetAction } from './ActionSheet';
import { IconCog, IconLogout, IconMoon, IconSun, IconUsers } from '@/components/icons';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';
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
  usePatchFolder,
  usePatchNote,
  useTags,
} from '@/lib/api/hooks';
import { dlog, drender, dtime } from '@/lib/debug';
import type { FolderDTO, NoteListItemDTO, PMDoc } from '@/lib/types';
import { usePrivateNotesStore } from '@/lib/store/private-notes-store';
import { PrivateNotesUnlockModal } from './settings/PrivateNotesUnlockModal';
import { PrivateNotesSetupModal } from './settings/PrivateNotesSetupModal';

type ConfirmState =
  | { kind: 'folder'; folder: FolderDTO }
  | { kind: 'forever'; noteId: string; noteTitle: string }
  | null;

export function AppShell() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const {
    view,
    setView,
    activeNoteId,
    setActiveNoteId,
    search,
    setSearch,
    settings,
    setTheme,
    toggleSidebarSection,
  } = useUIStore();

  const isMobile = useIsMobile();
  const [mobilePane, setMobilePane] = useState<MobilePane>('list');
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [actionMenuNote, setActionMenuNote] = useState<NoteListItemDTO | null>(null);
  const [folderPickerNoteId, setFolderPickerNoteId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  const patchFolder = usePatchFolder();

  // Private Notes (v1.5) — Zustand store + modal state. The store hydrates
  // lazily (status fetch on mount) so the round-trip cost is paid once per
  // session, not per render.
  const pnStatus = usePrivateNotesStore((s) => s.status);
  const pnHydrate = usePrivateNotesStore((s) => s.hydrate);
  const pnDecrypt = usePrivateNotesStore((s) => s.decryptNote);
  const pnEncrypt = usePrivateNotesStore((s) => s.encryptNote);
  const [pnUnlockOpen, setPnUnlockOpen] = useState(false);
  const [pnSetupOpen, setPnSetupOpen] = useState(false);
  // Cache of decrypted PMDocs keyed by note id. Held in React state so
  // mutations trigger re-render. We don't put this in the store because a
  // re-render of AppShell shouldn't drop it, and we don't put it in React
  // Query because the values derive from in-memory key material that isn't
  // part of the cache identity.
  const [decryptedMap, setDecryptedMap] = useState<Map<string, PMDoc>>(() => new Map());
  // The ref mirrors `decryptedMap` for stable access from event handlers
  // (toggle-lock, scheduleSave) without re-creating callbacks per render.
  const decryptedRef = useRef(decryptedMap);
  decryptedRef.current = decryptedMap;
  const setDecrypted = useCallback((id: string, doc: PMDoc) => {
    setDecryptedMap((prev) => {
      const next = new Map(prev);
      next.set(id, doc);
      return next;
    });
  }, []);
  const dropDecrypted = useCallback((id: string) => {
    setDecryptedMap((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    void pnHydrate();
    // Subscribe outside the React render cycle so the lock transition
    // doesn't trigger a set-state-in-effect lint warning. The Zustand
    // subscribe() returns its unsubscribe — wired to the effect's cleanup.
    const unsub = usePrivateNotesStore.subscribe((s, prev) => {
      if (prev.status === 'unlocked' && s.status !== 'unlocked') {
        setDecryptedMap(new Map());
      }
    });
    return unsub;
  }, [pnHydrate]);

  drender('AppShell', {
    view: view.kind,
    activeNoteId,
    noteLoaded: !!noteQ.data,
    noteStatus: noteQ.status,
    listCount: notesListQ.data?.length ?? 0,
    listStatus: notesListQ.status,
    isMobile,
    mobilePane,
  });

  const folders = useMemo(() => foldersQ.data ?? [], [foldersQ.data]);
  const tags = useMemo(() => tagsQ.data ?? [], [tagsQ.data]);
  const listNotes = useMemo(() => notesListQ.data ?? [], [notesListQ.data]);
  const counts = countsQ.data;

  // Keep the active note valid as the list changes — but on mobile, only when
  // the user is already on the editor pane, so opening the sidebar or coming
  // back to the list doesn't auto-jump into a note.
  useEffect(() => {
    dlog('effect', 'AppShell: list/active reconcile', {
      listCount: listNotes.length,
      activeNoteId,
      isMobile,
      mobilePane,
    });
    if (listNotes.length === 0) {
      if (activeNoteId) setActiveNoteId(null);
      return;
    }
    if (isMobile && mobilePane !== 'editor') return;
    // A deliberate null (e.g. after the user deletes/trashes the active note)
    // is respected — we drop to the editor's empty state instead of yanking
    // a different note into view. Only auto-pick when the active id points
    // at something that's been filtered out of the current view.
    if (activeNoteId && !listNotes.some((n) => n.id === activeNoteId)) {
      dlog('effect', 'AppShell: auto-selecting first note', { id: listNotes[0].id });
      setActiveNoteId(listNotes[0].id);
    }
  }, [listNotes, activeNoteId, setActiveNoteId, isMobile, mobilePane]);

  useEffect(() => {
    if (activeNoteId) dlog('ui', 'activeNoteId ->', { id: activeNoteId });
  }, [activeNoteId]);

  useEffect(() => {
    if (noteQ.data) dlog('ui', 'note loaded', { id: noteQ.data.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteQ.data?.id]);

  // Browser-back integration on mobile: push a stack entry when entering
  // editor/folders, pop when leaving. skipNextPop avoids recursion when we
  // trigger history.back() ourselves.
  const skipNextPop = useRef(false);
  useEffect(() => {
    if (!isMobile) return;
    const onPop = () => {
      if (skipNextPop.current) {
        skipNextPop.current = false;
        return;
      }
      setMobilePane((p) => (p === 'editor' || p === 'folders' ? 'list' : p));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isMobile]);

  const pushMobilePane = useCallback((next: MobilePane) => {
    setMobilePane((prev) => {
      if (prev === next) return prev;
      if (typeof window !== 'undefined') {
        if ((next === 'editor' || next === 'folders') && prev === 'list') {
          window.history.pushState({ sbPane: next }, '');
        } else if (next === 'list' && (prev === 'editor' || prev === 'folders')) {
          skipNextPop.current = true;
          window.history.back();
        }
      }
      return next;
    });
  }, []);

  const activeFolderName = useMemo(() => {
    if (search.trim()) return 'Search';
    switch (view.kind) {
      case 'all':
        return 'All Notes';
      case 'pinned':
        return 'Pinned';
      case 'private':
        return 'Private';
      case 'trash':
        return 'Trash';
      case 'time':
        return timeRangeLabel(view.range);
      case 'folder':
        return folders.find((f) => f.id === view.id)?.name ?? 'Folder';
      case 'tag':
        return `#${tags.find((t) => t.id === view.id)?.name ?? 'tag'}`;
    }
  }, [view, folders, tags, search]);

  const activeNote = noteQ.data ?? null;
  const activeNoteFolder = useMemo(
    () => (activeNote ? (folders.find((f) => f.id === activeNote.folderId) ?? null) : null),
    [activeNote, folders],
  );
  const activeNoteTags = useMemo(
    () =>
      (activeNote?.tagIds ?? [])
        .map((id) => tags.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => !!t),
    [activeNote, tags],
  );

  const pendingRef = useRef<{ title?: string; contentDirty?: boolean }>({});
  const timerRef = useRef<number | null>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  // Stable identity so child callbacks (onChangeTitle, onDirty) can be memoized
  // without re-creating on every AppShell render.
  const scheduleSave = useCallback(
    (id: string, isPrivate: boolean) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        const pending = pendingRef.current;
        pendingRef.current = {};
        const patch: Parameters<typeof patchNote.mutate>[0]['patch'] = {};
        if (pending.title !== undefined) patch.title = pending.title;
        if (pending.contentDirty && editorRef.current) {
          const doc = editorRef.current.getJSON() as PMDoc;
          if (isPrivate) {
            // Private save path: encrypt the PMDoc client-side and ship the
            // ciphertext + IV envelope. Server zeroes contentText/snippet
            // and skips embedding/wiki-link extraction (see lib/notes/service.ts).
            try {
              const enc = await pnEncrypt(doc);
              patch.encryption = enc.encryption;
              patch.ciphertext = enc.ciphertext;
              // Cache the freshly encrypted doc so the editor doesn't have
              // to round-trip through the server for the next render.
              setDecrypted(id, doc);
            } catch (err) {
              // Locked mid-save (or NMK gone). Surface and skip — the user
              // can unlock and re-save; the in-memory editor still holds
              // the dirty content.
              dlog('save', 'encrypt failed', { id, error: (err as Error).message });
              return;
            }
          } else {
            patch.content = doc;
          }
        }
        if (Object.keys(patch).length > 0) {
          dlog('save', 'autosave fire', { id, private: isPrivate, fields: Object.keys(patch) });
          patchNote.mutate({ id, patch });
        } else {
          dlog('save', 'autosave noop', { id });
        }
      }, 700);
    },
    [patchNote, pnEncrypt, setDecrypted],
  );

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
    const folderId = view.kind === 'folder' ? view.id : null;
    createNote.mutate(
      { folderId, title: '' },
      {
        onSuccess: (n) => {
          setActiveNoteId(n.id);
          if (isMobile) pushMobilePane('editor');
          t.end({ id: n.id });
        },
        onError: (err) => t.end({ error: (err as Error).message }),
      },
    );
  }

  function onAddFolder(input: { name: string; color: string; parentId: string | null }) {
    dlog('ui', 'click: add folder', input);
    createFolder.mutate(input);
  }

  function onRequestDeleteFolder(folder: FolderDTO) {
    setConfirmState({ kind: 'folder', folder });
  }

  function onRenameFolder(folder: FolderDTO, name: string) {
    dlog('ui', 'click: rename folder', { id: folder.id, from: folder.name, to: name });
    patchFolder.mutate({ id: folder.id, patch: { name } });
  }

  function onChangeFolderColor(folder: FolderDTO, hex: string) {
    if (folder.color.toLowerCase() === hex.toLowerCase()) return;
    dlog('ui', 'click: change folder colour', { id: folder.id, from: folder.color, to: hex });
    patchFolder.mutate({ id: folder.id, patch: { color: hex } });
  }

  function confirmDeleteFolder(folder: FolderDTO) {
    dlog('ui', 'click: delete folder', { id: folder.id, name: folder.name });
    // Capture the doomed subtree before the mutation removes it from cache,
    // so we can detect "user was viewing a sub-folder of the one being deleted."
    const doomed = new Set<string>([folder.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
          doomed.add(f.id);
          grew = true;
        }
      }
    }
    deleteFolder.mutate(folder.id, {
      onSuccess: () => {
        if (view.kind === 'folder' && doomed.has(view.id)) {
          setView({ kind: 'all' });
        }
      },
    });
  }

  function onTrashNote() {
    if (!activeNote) return;
    dlog('ui', 'click: trash note', { id: activeNote.id });
    patchNote.mutate({ id: activeNote.id, patch: { trashed: true } });
    setActiveNoteId(null);
  }

  function onRestoreNote() {
    if (!activeNote) return;
    dlog('ui', 'click: restore note', { id: activeNote.id });
    patchNote.mutate({ id: activeNote.id, patch: { trashed: false } });
  }

  function onRequestDeleteForever() {
    if (!activeNote) return;
    setConfirmState({
      kind: 'forever',
      noteId: activeNote.id,
      noteTitle: activeNote.title || 'Untitled',
    });
  }

  function confirmDeleteForever(noteId: string) {
    dlog('ui', 'click: delete forever', { id: noteId });
    if (activeNoteId === noteId) setActiveNoteId(null);
    deleteNote.mutate(noteId);
  }

  function onTogglePinActive() {
    if (!activeNote) return;
    dlog('ui', 'click: toggle pin', { id: activeNote.id, next: !activeNote.pinned });
    patchNote.mutate({ id: activeNote.id, patch: { pinned: !activeNote.pinned } });
  }

  function onSelectNote(id: string) {
    dlog('ui', 'click: select note', { id });
    setActiveNoteId(id);
    if (isMobile) pushMobilePane('editor');
  }

  function onMoveNoteToFolder(noteId: string, folderId: string | null) {
    dlog('ui', 'move note', { noteId, folderId });
    patchNote.mutate({ id: noteId, patch: { folderId } });
  }

  async function onSignOut() {
    const t = dtime('ui', 'click: sign out');
    await signOut({ redirect: false });
    router.push('/login');
    router.refresh();
    t.end();
  }

  const onViewFromSidebar = (v: typeof view) => {
    setView(v);
    if (isMobile) pushMobilePane('list');
  };

  // Build the action-menu contents for the note the user long-tapped ⋯ on.
  const menuActions: ActionSheetAction[] = useMemo(() => {
    const n = actionMenuNote;
    if (!n) return [];
    const closeMenu = () => setActionMenuNote(null);
    const isTrash = view.kind === 'trash';
    const acts: ActionSheetAction[] = [];
    if (!isTrash) {
      acts.push({
        id: 'move',
        label: 'Move to folder…',
        onSelect: () => {
          setFolderPickerNoteId(n.id);
          closeMenu();
        },
      });
      acts.push({
        id: 'pin',
        label: n.pinned ? 'Unpin' : 'Pin to top',
        onSelect: () => {
          patchNote.mutate({ id: n.id, patch: { pinned: !n.pinned } });
          closeMenu();
        },
      });
      acts.push({
        id: 'trash',
        label: 'Move to trash',
        destructive: true,
        onSelect: () => {
          patchNote.mutate({ id: n.id, patch: { trashed: true } });
          if (activeNoteId === n.id) setActiveNoteId(null);
          closeMenu();
        },
      });
    } else {
      acts.push({
        id: 'restore',
        label: 'Restore',
        onSelect: () => {
          patchNote.mutate({ id: n.id, patch: { trashed: false } });
          closeMenu();
        },
      });
      acts.push({
        id: 'forever',
        label: 'Delete forever…',
        destructive: true,
        onSelect: () => {
          setConfirmState({
            kind: 'forever',
            noteId: n.id,
            noteTitle: n.title || 'Untitled',
          });
          closeMenu();
        },
      });
    }
    return acts;
  }, [actionMenuNote, view.kind, patchNote, activeNoteId, setActiveNoteId]);

  const folderPickerActions: ActionSheetAction[] = useMemo(() => {
    if (!folderPickerNoteId) return [];
    const close = () => setFolderPickerNoteId(null);
    const pick = (folderId: string | null) => {
      onMoveNoteToFolder(folderPickerNoteId, folderId);
      close();
    };
    return [
      { id: 'unfiled', label: 'All Notes (unfiled)', onSelect: () => pick(null) },
      ...folders.map((f) => ({
        id: f.id,
        label: f.name,
        onSelect: () => pick(f.id),
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPickerNoteId, folders]);

  const mobileMenuActions: ActionSheetAction[] = useMemo(() => {
    const close = () => setMobileMenuOpen(false);
    const acts: ActionSheetAction[] = [
      {
        id: 'settings',
        label: 'Settings',
        icon: <IconCog size={18} />,
        onSelect: () => {
          close();
          router.push('/settings');
        },
      },
    ];
    if (isAdmin) {
      acts.push({
        id: 'admin',
        label: 'Admin · users',
        icon: <IconUsers size={18} />,
        onSelect: () => {
          close();
          router.push('/admin/users');
        },
      });
    }
    acts.push(
      {
        id: 'theme',
        label: settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        icon: settings.theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />,
        onSelect: () => {
          setTheme(settings.theme === 'dark' ? 'light' : 'dark');
          close();
        },
      },
      {
        id: 'signout',
        label: 'Sign out',
        icon: <IconLogout size={18} />,
        onSelect: () => {
          close();
          void onSignOut();
        },
      },
    );
    return acts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.theme, router, setTheme, isAdmin]);

  // Desktop keeps `sidebarHidden`; on mobile we always keep Sidebar mounted
  // under the 'folders' pane, so the setting doesn't apply.
  const showSidebar = isMobile ? true : !settings.sidebarHidden;

  const sidebarEl = showSidebar ? (
    <Sidebar
      folders={folders}
      tags={tags}
      allCount={counts?.all ?? 0}
      pinnedCount={counts?.pinned ?? 0}
      trashCount={counts?.trash ?? 0}
      privateCount={counts?.private ?? 0}
      view={view}
      onView={onViewFromSidebar}
      onNew={onNewNote}
      theme={settings.theme}
      onToggleTheme={() => setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
      density={settings.density}
      onAddFolder={onAddFolder}
      onDeleteFolder={onRequestDeleteFolder}
      onRenameFolder={onRenameFolder}
      onChangeFolderColor={onChangeFolderColor}
      onSignOut={onSignOut}
      onMoveNoteToFolder={onMoveNoteToFolder}
      fullWidth={isMobile}
      alwaysShowFolderActions={isMobile}
      isAdmin={isAdmin}
      collapsedSections={settings.sidebarSections}
      onToggleSection={toggleSidebarSection}
    />
  ) : null;

  const noteListEl = (
    <NoteList
      notes={listNotes}
      tags={tags}
      activeFolderName={activeFolderName}
      activeNoteId={activeNoteId}
      onSelect={onSelectNote}
      search={search}
      onSearch={setSearch}
      density={settings.density}
      fullWidth={isMobile}
      loading={notesListQ.isPending && !notesListQ.data}
      onOpenNoteMenu={isMobile ? (n) => setActionMenuNote(n) : undefined}
    />
  );

  const activeIsPrivate = !!activeNote && activeNote.encryption !== null;
  const decryptedForActive =
    activeNote && activeIsPrivate ? (decryptedMap.get(activeNote.id) ?? null) : null;

  // Decrypt-on-load: when the active note becomes private + the user is
  // unlocked + we don't yet have a decrypted PMDoc cached, run the unwrap.
  // Failures (wrong key, ciphertext tamper) are surfaced via the store's
  // `lastError` and the user can re-unlock from Settings.
  useEffect(() => {
    if (!activeNote || !activeIsPrivate || pnStatus !== 'unlocked') return;
    if (decryptedRef.current.has(activeNote.id)) return;
    const enc = activeNote.encryption;
    const ciphertext = activeNote.content;
    if (!enc || typeof ciphertext !== 'string') return;
    let cancelled = false;
    void pnDecrypt(ciphertext, enc).then(
      (doc) => {
        if (cancelled) return;
        setDecrypted(activeNote.id, doc);
      },
      (err) => {
        dlog('private-notes', 'decrypt failed', { id: activeNote.id, error: (err as Error).message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeNote, activeIsPrivate, pnStatus, pnDecrypt, setDecrypted]);

  const onToggleLock = () => {
    if (!activeNote) return;
    // Unconfigured → open the setup modal first; the user can come back to
    // toggle once setup is done.
    if (pnStatus === 'unconfigured') {
      setPnSetupOpen(true);
      return;
    }
    if (pnStatus === 'locked') {
      setPnUnlockOpen(true);
      return;
    }
    if (activeIsPrivate) {
      // Private → plaintext: confirm, then PATCH with `encryption: null` +
      // the decrypted PMDoc so the server can rebuild contentText / snippet
      // / embedding stale flag.
      if (
        !window.confirm(
          'Make this note plaintext? The body will be visible to MCP clients, the web clipper, and anyone with database access.',
        )
      ) {
        return;
      }
      const doc =
        decryptedForActive ??
        (editorRef.current ? (editorRef.current.getJSON() as PMDoc) : null);
      if (!doc) {
        dlog('ui', 'toggle-lock: no decrypted content available');
        return;
      }
      patchNote.mutate({
        id: activeNote.id,
        patch: { encryption: null, content: doc },
      });
      dropDecrypted(activeNote.id);
      return;
    }
    // Plaintext → private: encrypt the editor's current PMDoc and save.
    void (async () => {
      const doc = editorRef.current
        ? (editorRef.current.getJSON() as PMDoc)
        : (activeNote.content as PMDoc);
      try {
        const enc = await pnEncrypt(doc);
        patchNote.mutate({
          id: activeNote.id,
          patch: { encryption: enc.encryption, ciphertext: enc.ciphertext },
        });
        // Pre-populate the cache so the editor doesn't immediately drop to
        // the locked overlay while React Query refetches.
        setDecrypted(activeNote.id, doc);
      } catch (err) {
        dlog('ui', 'toggle-lock: encrypt failed', { error: (err as Error).message });
      }
    })();
  };

  const editorEl = (
    <Editor
      note={activeNote}
      folder={activeNoteFolder}
      tags={activeNoteTags}
      availableTags={tags}
      editorRef={editorRef}
      loading={!!activeNoteId && noteQ.isPending && !noteQ.data}
      onChangeTitle={(title) => {
        if (!activeNoteId) return;
        pendingRef.current.title = title;
        scheduleSave(activeNoteId, activeIsPrivate);
      }}
      onDirty={() => {
        if (!activeNoteId) return;
        pendingRef.current.contentDirty = true;
        scheduleSave(activeNoteId, activeIsPrivate);
      }}
      onTogglePin={onTogglePinActive}
      onChangeTags={(tagNames) => {
        if (!activeNoteId) return;
        dlog('ui', 'tags: change', { id: activeNoteId, tagNames });
        patchNote.mutate({ id: activeNoteId, patch: { tagNames } });
      }}
      onTrash={onTrashNote}
      onRestore={onRestoreNote}
      onDeleteForever={onRequestDeleteForever}
      decryptedContent={decryptedForActive}
      privateNotesStatus={pnStatus}
      onRequestUnlock={() => setPnUnlockOpen(true)}
      onToggleLock={onToggleLock}
    />
  );

  const mobileTitle =
    mobilePane === 'folders'
      ? 'Folders'
      : mobilePane === 'editor'
        ? activeNote?.title || (noteQ.isPending ? 'Loading…' : 'Untitled')
        : activeFolderName;

  const content = isMobile ? (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: 'var(--bg)',
      }}
    >
      <MobileTopBar
        pane={mobilePane}
        title={mobileTitle}
        onOpenFolders={() => pushMobilePane('folders')}
        onCloseFolders={() => pushMobilePane('list')}
        onBackToList={() => pushMobilePane('list')}
        onNewNote={onNewNote}
        onOpenMenu={() => setMobileMenuOpen(true)}
      />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={paneWrap(mobilePane === 'folders')}>{sidebarEl}</div>
        <div style={paneWrap(mobilePane === 'list')}>{noteListEl}</div>
        <div style={paneWrap(mobilePane === 'editor')}>{editorEl}</div>
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      {sidebarEl}
      {showSidebar && <PaneResizer side="sidebar" />}
      {noteListEl}
      <PaneResizer side="list" />
      {editorEl}
    </div>
  );

  return (
    <>
      {content}
      {!isMobile && <TweaksPanel />}
      <ConfirmDialog
        open={confirmState?.kind === 'folder'}
        title="Delete folder?"
        message={
          confirmState?.kind === 'folder' ? folderDeleteMessage(confirmState.folder, folders) : ''
        }
        confirmLabel="Delete folder"
        destructive
        onConfirm={() => {
          if (confirmState?.kind === 'folder') confirmDeleteFolder(confirmState.folder);
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />
      <ConfirmDialog
        open={confirmState?.kind === 'forever'}
        title="Delete forever?"
        message={
          confirmState?.kind === 'forever'
            ? `Delete "${confirmState.noteTitle}" forever? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete forever"
        destructive
        onConfirm={() => {
          if (confirmState?.kind === 'forever') confirmDeleteForever(confirmState.noteId);
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />
      <ActionSheet
        open={!!actionMenuNote}
        title={actionMenuNote?.title || 'Untitled'}
        actions={menuActions}
        onClose={() => setActionMenuNote(null)}
      />
      <ActionSheet
        open={!!folderPickerNoteId}
        title="Move to folder"
        actions={folderPickerActions}
        onClose={() => setFolderPickerNoteId(null)}
      />
      <ActionSheet
        open={mobileMenuOpen}
        actions={mobileMenuActions}
        onClose={() => setMobileMenuOpen(false)}
      />
      <PrivateNotesUnlockModal open={pnUnlockOpen} onClose={() => setPnUnlockOpen(false)} />
      <PrivateNotesSetupModal open={pnSetupOpen} onClose={() => setPnSetupOpen(false)} />
    </>
  );
}

function paneWrap(visible: boolean): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    display: visible ? 'flex' : 'none',
    flexDirection: 'column',
  };
}

function folderDeleteMessage(target: FolderDTO, all: FolderDTO[]): string {
  const childIds = new Set<string>([target.id]);
  // Walk descendants iteratively — the folder list is small enough that the
  // O(n*depth) blow-up doesn't matter.
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of all) {
      if (f.parentId && childIds.has(f.parentId) && !childIds.has(f.id)) {
        childIds.add(f.id);
        grew = true;
      }
    }
  }
  const subCount = childIds.size - 1;
  const base = `Delete folder "${target.name}"? Notes in this folder will move to All Notes.`;
  if (subCount === 0) return base;
  return `Delete folder "${target.name}" and its ${subCount} subfolder${subCount === 1 ? '' : 's'}? Notes inside will move to All Notes.`;
}
