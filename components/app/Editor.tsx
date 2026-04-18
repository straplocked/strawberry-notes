'use client';

import { useEditor, EditorContent, type Editor as TiptapEditor, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Image as ImageExt } from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extension-placeholder';
import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react';
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
  IconUnderline,
  IconUndo,
} from '@/components/icons';
import { formatDate } from '@/lib/format';
import { countTasks } from '@/lib/editor/prosemirror-utils';
import type { FolderDTO, NoteDTO, TagDTO } from '@/lib/types';

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
  tags: TagDTO[];
  onChangeTitle: (t: string) => void;
  onDirty: () => void;
  onTogglePin: () => void;
  editorRef?: MutableRefObject<TiptapEditor | null>;
  readOnly?: boolean;
}

export function Editor({
  note,
  folder,
  tags,
  onChangeTitle,
  onDirty,
  onTogglePin,
  editorRef,
  readOnly = false,
}: EditorProps) {
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;
  const onChangeTitleRef = useRef(onChangeTitle);
  onChangeTitleRef.current = onChangeTitle;

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
      ],
      content: (note?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }) as JSONContent,
      editable: !readOnly,
      editorProps: {
        attributes: { class: styles.pm, 'data-testid': 'pm-editor' },
      },
      onUpdate() {
        onDirtyRef.current();
      },
      immediatelyRender: false,
    },
    [note?.id],
  );

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

  if (!note) {
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

  const tagObjs = note.tagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as TagDTO[];
  const { total: taskTotal, done: taskDone } = countTasks(note.content);
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
          <button style={tbtnStyle()} title="More" type="button">
            <IconMore size={15} />
          </button>
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
            {tagObjs.map((t) => (
              <span key={t.id} style={tagChipEd}>
                #{t.name}
              </span>
            ))}
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
        </div>
      </div>
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
