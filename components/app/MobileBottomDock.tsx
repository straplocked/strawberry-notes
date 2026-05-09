'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import {
  IconBold,
  IconCheck,
  IconCog,
  IconFolder,
  IconImage,
  IconItalic,
  IconList,
  IconPlus,
} from '@/components/icons';

// ─────────────────────────────────────────────────────────────
// Bottom dock — list / folders panes
// Three flat tabs: Library / New / Settings. Berry chrome, no FAB, no notch.
// "Notes home" lives in the top-bar strawberry mark, so the dock stays
// minimal and predictable across panes.
// ─────────────────────────────────────────────────────────────

export type DockTab = 'library' | 'new' | 'settings';

export interface MobileBottomDockProps {
  active: DockTab | null;
  onTab: (tab: DockTab) => void;
}

const TABS: { id: DockTab; label: string; icon: ReactNode }[] = [
  {
    id: 'library',
    label: 'Library',
    icon: <IconFolder size={22} strokeWidth={1.9} />,
  },
  {
    id: 'new',
    label: 'New note',
    icon: <IconPlus size={22} strokeWidth={2.2} />,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <IconCog size={22} strokeWidth={1.9} />,
  },
];

export function MobileBottomDock({ active, onTab }: MobileBottomDockProps) {
  return (
    <div
      className="safe-x"
      style={{
        flexShrink: 0,
        color: '#fff',
        background: 'linear-gradient(180deg, #ee5060 0%, #d8324a 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
          // Symmetric vertical padding (8/8). On devices with a home
          // indicator, env(safe-area-inset-bottom) extends the bottom so
          // the bar paint reaches the screen edge without crowding labels.
          padding: '8px 6px max(env(safe-area-inset-bottom), 8px)',
        }}
      >
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              aria-label={t.label}
              aria-current={on ? 'page' : undefined}
              style={navTabStyle(on)}
            >
              <span style={{ width: 22, height: 22, display: 'inline-flex' }}>
                {t.icon}
              </span>
              <span style={navLabelStyle(on)}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function navTabStyle(active: boolean): CSSProperties {
  return {
    border: 0,
    background: active ? 'rgba(255,255,255,0.16)' : 'transparent',
    boxShadow: active ? 'inset 0 0 0 1px rgba(255,255,255,0.2)' : undefined,
    color: active ? '#fff' : 'rgba(255,255,255,0.86)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '6px 0',
    cursor: 'pointer',
    borderRadius: 12,
  };
}

const navLabelStyle = (active: boolean): CSSProperties => ({
  fontSize: 10,
  fontWeight: active ? 700 : 500,
  letterSpacing: '0.06em',
});

// ─────────────────────────────────────────────────────────────
// Editor dock (formatting toolbar)
// Same berry chrome as the nav dock; swapped role: TipTap formatting tools.
// Lives only on the editor pane, replacing the nav dock there. Voice
// button from the design is omitted — no dictation feature in this codebase.
// ─────────────────────────────────────────────────────────────

export interface MobileEditorDockProps {
  editor: TiptapEditor | null;
  onUploadImage: (file: File) => Promise<string | null>;
}

type EditorTool = {
  id: string;
  label: string;
  icon: ReactNode;
  isActive: (e: TiptapEditor) => boolean;
  run: (e: TiptapEditor) => void;
};

const EDITOR_TOOLS: EditorTool[] = [
  {
    id: 'todo',
    label: 'Todo',
    icon: <IconCheck size={22} strokeWidth={1.9} />,
    isActive: (e) => e.isActive('taskList'),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'list',
    label: 'List',
    icon: <IconList size={22} />,
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'bold',
    label: 'Bold',
    icon: <IconBold size={22} strokeWidth={2} />,
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    id: 'italic',
    label: 'Italic',
    icon: <IconItalic size={22} strokeWidth={1.9} />,
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
];

export function MobileEditorDock({ editor, onUploadImage }: MobileEditorDockProps) {
  const [, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-render when the cursor moves so isActive highlights stay in sync.
  useEffect(() => {
    if (!editor) return;
    const onTx = () => setTick((t) => (t + 1) % 1024);
    editor.on('transaction', onTx);
    editor.on('selectionUpdate', onTx);
    return () => {
      editor.off('transaction', onTx);
      editor.off('selectionUpdate', onTx);
    };
  }, [editor]);

  return (
    <div
      style={{
        flexShrink: 0,
        background: 'linear-gradient(180deg, #ee5060 0%, #d8324a 100%)',
        color: '#fff',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
      }}
      className="safe-x"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 2,
          padding: '8px 4px max(env(safe-area-inset-bottom), 8px)',
        }}
      >
        {EDITOR_TOOLS.map((t) => {
          const on = !!editor && t.isActive(editor);
          return (
            <button
              key={t.id}
              type="button"
              aria-label={t.label}
              aria-pressed={on}
              onClick={() => editor && t.run(editor)}
              style={dockToolStyle(on)}
            >
              <span style={{ width: 22, height: 22, display: 'inline-flex' }}>{t.icon}</span>
              <span style={dockToolLabel}>{t.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Image"
          onClick={() => fileRef.current?.click()}
          style={dockToolStyle(false)}
        >
          <span style={{ width: 22, height: 22, display: 'inline-flex' }}>
            <IconImage size={22} strokeWidth={1.9} />
          </span>
          <span style={dockToolLabel}>Image</span>
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f || !editor) return;
          const url = await onUploadImage(f);
          if (url) editor.chain().focus().setImage({ src: url, alt: f.name }).run();
        }}
      />
    </div>
  );
}

function dockToolStyle(active: boolean): CSSProperties {
  return {
    border: 0,
    background: active ? 'rgba(255,255,255,0.16)' : 'transparent',
    boxShadow: active ? 'inset 0 0 0 1px rgba(255,255,255,0.2)' : undefined,
    color: active ? '#fff' : 'rgba(255,255,255,0.92)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '6px 0',
    cursor: 'pointer',
    borderRadius: 10,
  };
}

const dockToolLabel: CSSProperties = {
  fontSize: 9.5,
  letterSpacing: '0.06em',
  fontWeight: 500,
};
