'use client';

import { useEditor, EditorContent, type Editor as TiptapEditor, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Image as ImageExt } from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extension-placeholder';
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { WikiLinkExtension, type WikiLinkTriggerState } from '@/lib/editor/wiki-link-plugin';
import { WikiLinkPopup } from './WikiLinkPopup';
import { useUIStore } from '@/lib/store/ui-store';
import { api } from '@/lib/api/client';
import {
  IconAttach,
  IconBold,
  IconCheck,
  IconDivider,
  IconH1,
  IconH2,
  IconImage,
  IconItalic,
  IconList,
  IconMore,
  IconPin,
  IconPinFill,
  IconQuote,
  IconRedo,
  IconShare,
  IconStrike,
  IconTrash,
  IconUnderline,
  IconUndo,
} from '@/components/icons';
import { formatDate } from '@/lib/format';
import { countTasks } from '@/lib/editor/prosemirror-utils';
import { dcount, dlog, drender } from '@/lib/debug';
import type { FolderDTO, NoteDTO, PMDoc, TagDTO } from '@/lib/types';

import { ActionSheet } from './ActionSheet';
import { BacklinksPanel } from './BacklinksPanel';
import { TagEditor } from './TagEditor';
import styles from './editor.module.css';

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '10px 18px',
  borderBottom: '1px solid var(--hair)',
  background: 'var(--surface)',
  overflowX: 'auto',
};

function tbtnStyle(active = false): CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: 0,
    background: active ? 'var(--berry-soft)' : 'transparent',
    color: active ? 'var(--berry-ink)' : 'var(--ink-2)',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  };
}

const tdiv: CSSProperties = {
  width: 1,
  height: 18,
  background: 'var(--hair)',
  margin: '0 6px',
  flexShrink: 0,
};

const headerMetaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 10,
  color: 'var(--ink)',
  fontVariantNumeric: 'tabular-nums',
  flexWrap: 'wrap',
  margin: '0 0 4px',
  textTransform: 'uppercase',
  letterSpacing: '0.16em',
  fontWeight: 500,
};

const metaChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 9px 4px',
  borderRadius: 999,
  background: 'var(--surface-2)',
  border: '1px solid var(--hair)',
  color: 'var(--ink-3)',
  fontSize: 11,
};

const tagChipEd: CSSProperties = {
  fontSize: 10.5,
  padding: '2px 8px 3px',
  borderRadius: 999,
  background: 'var(--berry-soft)',
  color: 'var(--berry-ink)',
  fontFamily: 'var(--font-mono)',
  border: '1px solid transparent',
};

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 38,
  fontWeight: 600,
  lineHeight: 1.1,
  letterSpacing: '-0.025em',
  color: 'var(--ink)',
  border: 0,
  outline: 'none',
  width: '100%',
  background: 'transparent',
  margin: '8px 0 18px',
  padding: 0,
  resize: 'none',
  overflow: 'hidden',
};

export interface EditorProps {
  note: NoteDTO | null;
  folder: FolderDTO | null;
  /** Tags currently attached to the open note. */
  tags: TagDTO[];
  /**
   * The user's full tag library — drives the TagEditor's autocomplete.
   * Optional so legacy callers without it just lose the suggestion list.
   */
  availableTags?: TagDTO[];
  onChangeTitle: (t: string) => void;
  onDirty: () => void;
  onTogglePin: () => void;
  /**
   * Replace the note's tag membership. Names are lowercase + deduped before
   * arriving here (the TagEditor handles normalisation).
   */
  onChangeTags?: (names: string[]) => void;
  onTrash?: () => void;
  onRestore?: () => void;
  onDeleteForever?: () => void;
  editorRef?: MutableRefObject<TiptapEditor | null>;
  readOnly?: boolean;
  loading?: boolean;
}

function EditorImpl({
  note,
  folder,
  tags,
  availableTags,
  onChangeTitle,
  onDirty,
  onTogglePin,
  onChangeTags,
  onTrash,
  onRestore,
  onDeleteForever,
  editorRef,
  readOnly = false,
  loading = false,
}: EditorProps) {
  drender('Editor', { noteId: note?.id, readOnly });
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  // Keep the latest callbacks behind refs so `useEditor` doesn't need to
  // re-create the TipTap instance on every parent re-render (typing lag).
  // Sync in an effect — assigning `.current` during render violates the
  // react-hooks/refs rule under the React compiler.
  const onDirtyRef = useRef(onDirty);
  const onChangeTitleRef = useRef(onChangeTitle);
  useEffect(() => {
    onDirtyRef.current = onDirty;
    onChangeTitleRef.current = onChangeTitle;
  });

  // --- Wiki-link autocomplete state ---------------------------------------
  // Held in React (not ProseMirror state) because the popup is a React tree.
  // `triggerRef` mirrors the current trigger so the stable `onTriggerChange`
  // callback can compare without depending on render state.
  const [wikiTrigger, setWikiTrigger] = useState<WikiLinkTriggerState | null>(null);
  const wikiKeyHandlerRef = useRef<((e: KeyboardEvent) => boolean) | null>(null);
  const setActiveNoteId = useUIStore((s) => s.setActiveNoteId);

  // --- "More" menu --------------------------------------------------------
  const [moreOpen, setMoreOpen] = useState(false);

  const handleWikiTriggerChange = useCallback((t: WikiLinkTriggerState | null) => {
    setWikiTrigger(t);
  }, []);

  const handleWikiLinkClick = useCallback(
    async (title: string) => {
      // Resolve the title to a note id using the lightweight titles endpoint.
      // Exact-match wins; otherwise we fall back to the first result.
      try {
        const rows = await api.notes.titles(title);
        const exact =
          rows.find((r) => r.title.toLowerCase() === title.toLowerCase()) ?? rows[0];
        if (exact) setActiveNoteId(exact.id);
      } catch {
        /* best-effort — silent failure keeps the editor responsive */
      }
    },
    [setActiveNoteId],
  );

  const resizeTitle = () => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        ImageExt,
        Placeholder.configure({ placeholder: 'Start writing…' }),
        WikiLinkExtension.configure({
          onTriggerChange: handleWikiTriggerChange,
          onLinkClick: handleWikiLinkClick,
        }),
      ],
      content: (note?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }) as JSONContent,
      editable: !readOnly,
      editorProps: {
        attributes: { class: styles.pm, 'data-testid': 'pm-editor' },
        // Backspace at the very start of the body moves the cursor to the
        // end of the title — treats the title/body gap as a single "line
        // break" that one backspace consumes. A subsequent backspace then
        // deletes a title character via native textarea behaviour.
        //
        // Also: when the wiki-link popup is open, forward ArrowUp/Down,
        // Enter, Tab and Escape into it so the user can navigate results
        // without leaving the keyboard.
        handleKeyDown(view, event) {
          const popupHandler = wikiKeyHandlerRef.current;
          if (
            popupHandler &&
            (event.key === 'ArrowDown' ||
              event.key === 'ArrowUp' ||
              event.key === 'Enter' ||
              event.key === 'Tab' ||
              event.key === 'Escape')
          ) {
            if (popupHandler(event)) {
              event.preventDefault();
              return true;
            }
          }

          if (
            event.key !== 'Backspace' ||
            event.shiftKey ||
            event.metaKey ||
            event.ctrlKey ||
            event.altKey
          ) {
            return false;
          }
          const { selection } = view.state;
          // PM position 1 = inside the first top-level node, at its start.
          if (!selection.empty || selection.from !== 1) return false;
          const el = titleRef.current;
          if (!el) return false;
          event.preventDefault();
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
          dlog('editor', 'backspace→title');
          return true;
        },
      },
      onCreate({ editor }) {
        dlog('editor', 'onCreate', { noteId: note?.id, docSize: editor.state.doc.content.size });
      },
      onDestroy() {
        dlog('editor', 'onDestroy', { noteId: note?.id });
      },
      onFocus() {
        dlog('editor', 'focus', { noteId: note?.id });
      },
      onBlur() {
        dlog('editor', 'blur', { noteId: note?.id });
      },
      onUpdate() {
        dcount('editor', 'onUpdate');
        onDirtyRef.current();
      },
      onSelectionUpdate() {
        dcount('editor', 'onSelectionUpdate');
      },
      onTransaction({ transaction }) {
        // Per-transaction counter is useful when diagnosing perf — don't log each.
        if (transaction.docChanged) dcount('editor', 'docChanged');
      },
      immediatelyRender: false,
    },
    [note?.id],
  );

  // Tracks whether useEditor has rebuilt the instance (note?.id changed).
  useEffect(() => {
    dlog('editor', 'useEditor instance', { noteId: note?.id, hasEditor: !!editor });
  }, [editor, note?.id]);

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
    return () => {
      if (editorRef && editorRef.current === editor) editorRef.current = null;
    };
  }, [editor, editorRef]);

  // Auto-resize the title textarea whenever the active note changes (mount/switch).
  useEffect(() => {
    resizeTitle();
  }, [note?.id]);

  // Note: closing the popup on a note switch is handled by the plugin's
  // `view.destroy()` hook emitting `null` — no React-side effect needed.

  // Replace the `[[partial` at [from..to] with `[[title]]` and close the popup.
  // The popup passes `id` too (so the caller could also set activeNoteId on
  // pick) but we intentionally just insert the link — the user chose to link
  // here, not to navigate away.
  const pickWikiTitle = useCallback(
    (title: string) => {
      if (!editor || !wikiTrigger) return;
      const insertion = `[[${title}]]`;
      editor
        .chain()
        .focus()
        .insertContentAt({ from: wikiTrigger.from, to: wikiTrigger.to }, insertion)
        .run();
      setWikiTrigger(null);
    },
    [editor, wikiTrigger],
  );

  const dismissWiki = useCallback(() => setWikiTrigger(null), []);

  if (!note) {
    if (loading) {
      return (
        <div className={styles.root}>
          <div className={styles.emptyState}>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading note…</div>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No note selected</div>
          <div style={{ fontSize: 13 }}>
            Pick one from the list, or start a fresh strawberry note.
          </div>
        </div>
      </div>
    );
  }

  // Private Notes (v1.5): the body is AES-GCM ciphertext that the server
  // cannot read. The full unlock flow ships in a follow-up PR; for now,
  // render a placeholder rather than attempting to feed the ciphertext
  // string into the editor / countTasks. No private note can exist yet
  // because no UI creates one — this is a forward-compat guard.
  if (note.encryption !== null) {
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>🔒 Private note</div>
          <div style={{ fontSize: 13 }}>
            This note is encrypted. Unlock support is coming in a follow-up release.
          </div>
        </div>
      </div>
    );
  }

  const tagObjs = note.tagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as TagDTO[];
  // Safe cast: the `note.encryption !== null` branch above ensures `content`
  // is a PMDoc for the rest of this function.
  const noteContent = note.content as PMDoc;
  const { total: taskTotal, done: taskDone } = countTasks(noteContent);
  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor?.isActive(name, attrs) ?? false;

  const cmd = (fn: () => void) => () => {
    if (!editor) return;
    fn();
  };

  return (
    <div className={styles.root}>
      <div style={toolbarStyle}>
        <button
          style={tbtnStyle()}
          title="Undo"
          type="button"
          onClick={cmd(() => editor?.chain().focus().undo().run())}
        >
          <IconUndo size={15} />
        </button>
        <button
          style={tbtnStyle()}
          title="Redo"
          type="button"
          onClick={cmd(() => editor?.chain().focus().redo().run())}
        >
          <IconRedo size={15} />
        </button>
        <div style={tdiv} />
        <button
          style={tbtnStyle(isActive('heading', { level: 1 }))}
          title="Heading 1"
          type="button"
          onClick={cmd(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
        >
          <IconH1 size={15} />
        </button>
        <button
          style={tbtnStyle(isActive('heading', { level: 2 }))}
          title="Heading 2"
          type="button"
          onClick={cmd(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
        >
          <IconH2 size={15} />
        </button>
        <button
          style={tbtnStyle(isActive('paragraph'))}
          title="Body"
          type="button"
          onClick={cmd(() => editor?.chain().focus().setParagraph().run())}
        >
          <span style={{ fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600 }}>P</span>
        </button>
        <div style={tdiv} />
        <button
          style={tbtnStyle(isActive('bold'))}
          title="Bold"
          type="button"
          onClick={cmd(() => editor?.chain().focus().toggleBold().run())}
        >
          <IconBold size={14} />
        </button>
        <button
          style={tbtnStyle(isActive('italic'))}
          title="Italic"
          type="button"
          onClick={cmd(() => editor?.chain().focus().toggleItalic().run())}
        >
          <IconItalic size={14} />
        </button>
        <button
          style={tbtnStyle(isActive('underline'))}
          title="Underline"
          type="button"
          onClick={cmd(() => editor?.chain().focus().toggleUnderline?.().run())}
        >
          <IconUnderline size={14} />
        </button>
        <button
          style={tbtnStyle(isActive('strike'))}
          title="Strikethrough"
          type="button"
          onClick={cmd(() => editor?.chain().focus().toggleStrike().run())}
        >
          <IconStrike size={14} />
        </button>
        <div style={tdiv} />
        <button
          style={tbtnStyle(isActive('taskList'))}
          title="Checklist"
          type="button"
          onClick={cmd(() => editor?.chain().focus().toggleTaskList().run())}
        >
          <IconCheck size={15} />
        </button>
        <button
          style={tbtnStyle(isActive('bulletList'))}
          title="Bullet list"
          type="button"
          onClick={cmd(() => editor?.chain().focus().toggleBulletList().run())}
        >
          <IconList size={15} />
        </button>
        <button
          style={tbtnStyle(isActive('blockquote'))}
          title="Quote"
          type="button"
          onClick={cmd(() => editor?.chain().focus().toggleBlockquote().run())}
        >
          <IconQuote size={15} />
        </button>
        <button
          style={tbtnStyle()}
          title="Divider"
          type="button"
          onClick={cmd(() => editor?.chain().focus().setHorizontalRule().run())}
        >
          <IconDivider size={15} />
        </button>
        <div style={tdiv} />
        <ImageUploadButton editor={editor} />
        <button style={tbtnStyle()} title="Attach" type="button">
          <IconAttach size={15} />
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {note.trashedAt ? (
            <>
              <button
                style={tbtnStyle()}
                title="Restore"
                type="button"
                onClick={onRestore}
              >
                <IconUndo size={15} />
              </button>
              <button
                style={{ ...tbtnStyle(), color: 'var(--berry)' }}
                title="Delete forever"
                type="button"
                onClick={onDeleteForever}
              >
                <IconTrash size={15} />
              </button>
            </>
          ) : (
            <>
              <button
                style={tbtnStyle(note.pinned)}
                title={note.pinned ? 'Unpin' : 'Pin'}
                type="button"
                onClick={onTogglePin}
              >
                {note.pinned ? <IconPinFill size={14} /> : <IconPin size={14} />}
              </button>
              <button style={tbtnStyle()} title="Share" type="button">
                <IconShare size={15} />
              </button>
              <button
                style={tbtnStyle(moreOpen)}
                title="More"
                type="button"
                onClick={() => setMoreOpen(true)}
              >
                <IconMore size={15} />
              </button>
              {onTrash && (
                <button
                  style={tbtnStyle()}
                  title="Move to Trash"
                  type="button"
                  onClick={onTrash}
                >
                  <IconTrash size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className={styles.canvas}>
        <div className={styles.page}>
          <div style={headerMetaStyle}>
            <span style={metaChip}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: folder?.color ?? 'var(--ink-4)',
                }}
              />
              {folder?.name ?? 'Unfiled'}
            </span>
            <span style={{ color: 'var(--berry)', fontWeight: 500 }}>
              {formatDate(note.updatedAt)}
            </span>
            {taskTotal > 0 && (
              <span style={metaChip}>
                <IconCheck size={11} style={{ color: 'var(--leaf)' }} /> {taskDone}/{taskTotal}
              </span>
            )}
            {onChangeTags && !note.trashedAt ? (
              <TagEditor
                value={tagObjs.map((t) => t.name)}
                available={availableTags ?? tags}
                onChange={onChangeTags}
                readOnly={readOnly}
              />
            ) : (
              tagObjs.map((t) => (
                <span key={t.id} style={tagChipEd}>
                  #{t.name}
                </span>
              ))
            )}
          </div>

          <textarea
            key={note.id}
            ref={titleRef}
            style={titleStyle}
            defaultValue={note.title}
            rows={1}
            placeholder="Untitled"
            onInput={(e) => {
              resizeTitle();
              onChangeTitleRef.current((e.target as HTMLTextAreaElement).value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                editor?.chain().focus('start').run();
              }
            }}
          />

          <EditorContent editor={editor} />

          {!note.trashedAt && <BacklinksPanel noteId={note.id} />}
        </div>
      </div>
      {wikiTrigger && (
        <WikiLinkPopup
          query={wikiTrigger.query}
          coords={wikiTrigger.coords}
          onPick={pickWikiTitle}
          onDismiss={dismissWiki}
          keyHandlerRef={wikiKeyHandlerRef}
        />
      )}
      <ActionSheet
        open={moreOpen}
        title="Note actions"
        onClose={() => setMoreOpen(false)}
        actions={[
          {
            id: 'export-md',
            label: 'Export this note as Markdown',
            onSelect: () => {
              setMoreOpen(false);
              api.notes.exportMarkdown(note.id);
            },
          },
          {
            id: 'export-all',
            label: 'Export all notes as ZIP',
            onSelect: () => {
              setMoreOpen(false);
              window.location.href = '/api/export/all.zip';
            },
          },
        ]}
      />
    </div>
  );
}

function ImageUploadButton({ editor }: { editor: TiptapEditor | null }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button
        style={tbtnStyle()}
        title="Image"
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        <IconImage size={15} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f || !editor) return;
          e.target.value = '';
          const form = new FormData();
          form.append('file', f);
          try {
            const res = await fetch('/api/uploads', { method: 'POST', body: form });
            if (!res.ok) return;
            const { url } = (await res.json()) as { url: string };
            editor.chain().focus().setImage({ src: url, alt: f.name }).run();
          } catch {
            /* swallow; v1 will surface an error toast */
          }
        }}
      />
    </>
  );
}

export const Editor = memo(EditorImpl);
