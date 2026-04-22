'use client';

import type React from 'react';
import { useState, type CSSProperties } from 'react';
import {
  IconAll,
  IconBerry,
  IconLogout,
  IconMoon,
  IconPin,
  IconPlus,
  IconSun,
  IconTrash,
} from '@/components/icons';
import { ACCENTS, type Density } from '@/lib/design/accents';
import { drender } from '@/lib/debug';
import { DRAG_MIME } from '@/lib/dnd';
import type { FolderDTO, FolderView, TagDTO } from '@/lib/types';

const styles: Record<string, CSSProperties> = {
  root: {
    width: 232,
    flexShrink: 0,
    background: 'var(--surface-2)',
    borderRight: '1px solid var(--hair)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '16px 18px 14px',
    color: 'var(--ink)',
  },
  brandMark: { width: 34, height: 34, display: 'grid', placeItems: 'center' },
  brandName: {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1,
    letterSpacing: '-0.02em',
  },
  brandSub: {
    fontSize: 10.5,
    color: 'var(--ink-4)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginTop: 3,
  },
  section: { padding: '10px 10px 4px' },
  sectionHead: {
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: 600,
    color: 'var(--ink-4)',
    padding: '6px 10px 4px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagCloud: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 10px 10px' },
  footer: {
    marginTop: 'auto',
    borderTop: '1px solid var(--hair)',
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  footBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--ink-3)',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  },
  newBtn: {
    flex: 1,
    height: 30,
    padding: '0 10px',
    border: 0,
    borderRadius: 7,
    background: 'var(--berry)',
    color: 'white',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    boxShadow:
      '0 1px 0 rgba(255,255,255,0.25) inset, 0 1px 3px rgba(0,0,0,0.15)',
  },
  newFolderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 10px',
  },
  newFolderInput: {
    flex: 1,
    background: 'var(--surface)',
    border: '1px solid var(--hair-2)',
    borderRadius: 6,
    color: 'var(--ink)',
    padding: '4px 8px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
  },
  folderDelete: {
    marginLeft: 'auto',
    width: 20,
    height: 20,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 5,
    color: 'var(--ink-4)',
    cursor: 'pointer',
  },
};

function itemStyle(active: boolean, dense: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: dense ? '5px 10px' : '7px 10px',
    borderRadius: 7,
    cursor: 'pointer',
    color: active ? 'var(--ink)' : 'var(--ink-2)',
    background: active ? 'var(--surface)' : 'transparent',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px var(--hair)' : 'none',
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    position: 'relative',
  };
}

function dotStyle(color: string): CSSProperties {
  return { width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 };
}

const countStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  color: 'var(--ink-4)',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
};

function tagChip(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 9px 5px',
    borderRadius: 999,
    background: active ? 'var(--berry-soft)' : 'var(--surface)',
    color: active ? 'var(--berry-ink)' : 'var(--ink-2)',
    border: '1px solid ' + (active ? 'transparent' : 'var(--hair)'),
    fontSize: 11.5,
    cursor: 'pointer',
    fontWeight: active ? 600 : 500,
  };
}

function randomAccentHex(): string {
  return ACCENTS[Math.floor(Math.random() * ACCENTS.length)].hex;
}

export interface SidebarProps {
  folders: FolderDTO[];
  tags: TagDTO[];
  allCount: number;
  pinnedCount: number;
  trashCount: number;
  view: FolderView;
  onView: (v: FolderView) => void;
  onNew: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  density: Density;
  onAddFolder?: (input: { name: string; color: string }) => void;
  onDeleteFolder?: (folder: FolderDTO) => void;
  onSignOut?: () => void;
  onMoveNoteToFolder?: (noteId: string, folderId: string | null) => void;
}

export function Sidebar(props: SidebarProps) {
  const { folders, tags, view, onView, density } = props;
  drender('Sidebar', { folders: folders.length, tags: tags.length, view: view.kind });
  const dense = density === 'dense';
  const isActiveKind = (k: FolderView['kind']) => view.kind === k;
  const isActiveFolder = (id: string) => view.kind === 'folder' && view.id === id;
  const isActiveTag = (id: string) => view.kind === 'tag' && view.id === id;

  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [hoverFolderId, setHoverFolderId] = useState<string | null>(null);
  // Drop-target id: a folder uuid, '__unfiled__' for the "All Notes" row, or null.
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const makeDropHandlers = (id: string, folderId: string | null) => {
    if (!props.onMoveNoteToFolder) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropTargetId !== id) setDropTargetId(id);
      },
      onDragLeave: (e: React.DragEvent) => {
        // Ignore leave events that bubble from child elements.
        if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
        setDropTargetId((d) => (d === id ? null : d));
      },
      onDrop: (e: React.DragEvent) => {
        const noteId = e.dataTransfer.getData(DRAG_MIME);
        setDropTargetId(null);
        if (!noteId) return;
        e.preventDefault();
        props.onMoveNoteToFolder?.(noteId, folderId);
      },
    };
  };

  const dropHighlight = (active: boolean): CSSProperties =>
    active
      ? {
          background: 'var(--berry-soft)',
          boxShadow: '0 0 0 2px var(--berry)',
        }
      : {};

  const commitDraft = () => {
    const name = draftName.trim();
    if (name && props.onAddFolder) {
      props.onAddFolder({ name, color: randomAccentHex() });
    }
    setDraftName('');
    setAdding(false);
  };

  return (
    <aside style={styles.root}>
      <div style={styles.brand}>
        <div style={styles.brandMark}>
          <IconBerry size={30} />
        </div>
        <div>
          <div style={styles.brandName}>Strawberry</div>
          <div style={styles.brandSub}>Notes</div>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        <div style={styles.section}>
          <div style={styles.sectionHead}>
            <span>Library</span>
          </div>
          <div
            style={{
              ...itemStyle(isActiveKind('all'), dense),
              ...dropHighlight(dropTargetId === '__unfiled__'),
            }}
            onClick={() => onView({ kind: 'all' })}
            {...makeDropHandlers('__unfiled__', null)}
          >
            <IconAll size={15} style={{ color: isActiveKind('all') ? 'var(--berry)' : 'var(--ink-3)' }} />
            <span>All Notes</span>
            <span style={countStyle}>{props.allCount}</span>
          </div>
          <div
            style={itemStyle(isActiveKind('pinned'), dense)}
            onClick={() => onView({ kind: 'pinned' })}
          >
            <IconPin size={15} style={{ color: isActiveKind('pinned') ? 'var(--berry)' : 'var(--ink-3)' }} />
            <span>Pinned</span>
            <span style={countStyle}>{props.pinnedCount}</span>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHead}>
            <span>Folders</span>
            {props.onAddFolder && (
              <IconPlus
                size={13}
                style={{ color: 'var(--ink-4)', cursor: 'pointer' }}
                onClick={() => {
                  setAdding(true);
                  setDraftName('');
                }}
              />
            )}
          </div>
          {adding && (
            <div style={styles.newFolderRow}>
              <span style={dotStyle('var(--ink-4)')} />
              <input
                autoFocus
                style={styles.newFolderInput}
                placeholder="New folder…"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitDraft();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setAdding(false);
                    setDraftName('');
                  }
                }}
                onBlur={commitDraft}
              />
            </div>
          )}
          {folders.map((f) => {
            const active = isActiveFolder(f.id);
            const hovered = hoverFolderId === f.id;
            return (
              <div
                key={f.id}
                style={{
                  ...itemStyle(active, dense),
                  ...dropHighlight(dropTargetId === f.id),
                }}
                onClick={() => onView({ kind: 'folder', id: f.id })}
                onMouseEnter={() => setHoverFolderId(f.id)}
                onMouseLeave={() => setHoverFolderId((h) => (h === f.id ? null : h))}
                {...makeDropHandlers(f.id, f.id)}
              >
                <span style={dotStyle(f.color)} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.name}
                </span>
                {hovered && props.onDeleteFolder ? (
                  <span
                    style={styles.folderDelete}
                    title={`Delete folder "${f.name}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onDeleteFolder?.(f);
                    }}
                  >
                    <IconTrash size={13} />
                  </span>
                ) : (
                  <span style={countStyle}>{f.count}</span>
                )}
              </div>
            );
          })}
        </div>

        {tags.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionHead}>
              <span>Tags</span>
            </div>
            <div style={styles.tagCloud}>
              {tags.map((t) => (
                <span
                  key={t.id}
                  style={tagChip(isActiveTag(t.id))}
                  onClick={() => onView(isActiveTag(t.id) ? { kind: 'all' } : { kind: 'tag', id: t.id })}
                >
                  #{t.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={styles.section}>
          <div
            style={itemStyle(isActiveKind('trash'), dense)}
            onClick={() => onView({ kind: 'trash' })}
          >
            <IconTrash size={15} style={{ color: isActiveKind('trash') ? 'var(--berry)' : 'var(--ink-3)' }} />
            <span>Trash</span>
            <span style={countStyle}>{props.trashCount}</span>
          </div>
        </div>
      </div>

      <div style={styles.footer}>
        <button style={styles.newBtn} onClick={props.onNew} type="button">
          <IconPlus size={13} />
          New note
        </button>
        <button
          style={styles.footBtn}
          onClick={props.onToggleTheme}
          title="Toggle theme"
          type="button"
        >
          {props.theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
        </button>
        {props.onSignOut && (
          <button
            style={styles.footBtn}
            onClick={props.onSignOut}
            title="Sign out"
            type="button"
          >
            <IconLogout size={15} />
          </button>
        )}
      </div>
    </aside>
  );
}
