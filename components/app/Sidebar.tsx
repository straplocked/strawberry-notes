'use client';

import type React from 'react';
import { memo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  IconAll,
  IconBerry,
  IconCalendar,
  IconChevronRight,
  IconCog,
  IconEdit,
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
import { TIME_RANGES, timeRangeLabel } from '@/lib/notes/time-range';
import type { FolderDTO, FolderView, TagDTO, TimeRange } from '@/lib/types';

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
    // One step warmer than the inline `+` action so the label wins the row.
    color: 'var(--ink-3)',
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
  // Layout-only base for the sidebar's per-row icon buttons (chevron, +,
  // edit, delete). Background and color come from `.sn-icon-btn` in
  // globals.css so `:hover` actually composes — inline declarations beat
  // any stylesheet rule.
  iconBtn: {
    width: 22,
    height: 22,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 5,
    flexShrink: 0,
  },
  // Right-edge slot of a folder row — count at rest, action buttons on
  // hover. Both layers are absolutely positioned over each other so the
  // row width never shifts. See renderFolderNode().
  trailingSlot: {
    marginLeft: 'auto',
    position: 'relative',
    minWidth: 72,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
};

/**
 * Layout-only base for sidebar nav rows. Background, ink, and active ring
 * come from `.sn-nav-row[--active]` in globals.css.
 *
 * `gap: 8` (was 10) tightens the row's left side so labels sit closer to
 * the leading icon/dot. Combined with the leading-affordance sub-flex used
 * for folder rows, this brings the leading inset down to roughly match the
 * trailing inset of the count/actions slot.
 */
function itemStyle(dense: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: dense ? '5px 10px' : '7px 10px',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 13,
    position: 'relative',
  };
}

function navRowClass(active: boolean): string {
  return active ? 'sn-nav-row sn-nav-row--active' : 'sn-nav-row';
}

function navRowStyle(active: boolean, dense: boolean): CSSProperties {
  // `fontWeight` stays inline because it's a numeric design token, not a
  // state-toggleable color. Same reasoning as `padding`.
  return { ...itemStyle(dense), fontWeight: active ? 600 : 500 };
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

/**
 * Layout-only base for a tag-cloud chip. Background + ink come from
 * `.sn-tag-chip[--active]` in globals.css so we get hover and rest paint
 * without per-chip mouseover state.
 */
function tagChipStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 9px 5px',
    borderRadius: 999,
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
  onAddFolder?: (input: { name: string; color: string; parentId: string | null }) => void;
  onDeleteFolder?: (folder: FolderDTO) => void;
  onRenameFolder?: (folder: FolderDTO, name: string) => void;
  onSignOut?: () => void;
  onMoveNoteToFolder?: (noteId: string, folderId: string | null) => void;
  fullWidth?: boolean;
  alwaysShowFolderActions?: boolean;
}

interface FolderTreeNode {
  folder: FolderDTO;
  depth: number;
  children: FolderTreeNode[];
}

/**
 * Build a tree from a flat folder list. Orphan folders (parent missing or
 * filtered out) surface at the root so a corrupted parent_id is never the
 * reason a folder disappears from the sidebar.
 */
function buildFolderTree(folders: FolderDTO[]): FolderTreeNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const childrenOf = new Map<string | null, FolderDTO[]>();
  for (const f of folders) {
    const parentKey = f.parentId && byId.has(f.parentId) ? f.parentId : null;
    const list = childrenOf.get(parentKey);
    if (list) list.push(f);
    else childrenOf.set(parentKey, [f]);
  }
  const build = (parentId: string | null, depth: number): FolderTreeNode[] => {
    const kids = childrenOf.get(parentId) ?? [];
    return kids.map((folder) => ({
      folder,
      depth,
      children: build(folder.id, depth + 1),
    }));
  };
  return build(null, 0);
}

function SidebarImpl(props: SidebarProps) {
  const { folders, tags, view, onView, density, fullWidth, alwaysShowFolderActions } = props;
  drender('Sidebar', { folders: folders.length, tags: tags.length, view: view.kind });
  const dense = density === 'dense';
  const isActiveKind = (k: FolderView['kind']) => view.kind === k;
  const isActiveFolder = (id: string) => view.kind === 'folder' && view.id === id;
  const isActiveTag = (id: string) => view.kind === 'tag' && view.id === id;
  const isActiveTime = (range: TimeRange) =>
    view.kind === 'time' && view.range === range;

  // `addingUnder` carries the parent folder id we're creating a sub-folder
  // under; null means a new top-level folder; undefined means not adding.
  const [addingUnder, setAddingUnder] = useState<string | null | undefined>(undefined);
  const [draftName, setDraftName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [hoverFolderId, setHoverFolderId] = useState<string | null>(null);
  // Folder ids whose subtree the user has collapsed. Per-session local state —
  // not persisted; tree shape changes (rename, reparent) shouldn't surprise
  // the user across reloads, and the sidebar is small enough that re-expand
  // is a single click.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
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
    if (name && props.onAddFolder && addingUnder !== undefined) {
      props.onAddFolder({ name, color: randomAccentHex(), parentId: addingUnder });
    }
    setDraftName('');
    setAddingUnder(undefined);
  };

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tree = buildFolderTree(folders);

  const renderFolderNode = (node: FolderTreeNode): React.ReactNode => {
    const f = node.folder;
    const active = isActiveFolder(f.id);
    const hovered = hoverFolderId === f.id;
    const isRenaming = renamingId === f.id;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(f.id);
    // 12px indent per nesting level (was 14) — pairs with the tighter row
    // gap and leading-group spacing so 3-deep folders still have room to
    // breathe while keeping the leading inset close to the row padding.
    const indent = node.depth * 12;
    // Top-level folders carry a coloured dot for identity. Sub-folders
    // inherit identity from the parent above and the chevron — a second dot
    // is visual noise inside an already-narrow 232px rail.
    const showDot = node.depth === 0;
    if (isRenaming) {
      return (
        <div key={f.id} style={{ ...styles.newFolderRow, paddingLeft: 10 + indent, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ width: 12, flexShrink: 0 }} />
            {showDot && <span style={dotStyle(f.color)} />}
          </div>
          <input
            autoFocus
            style={styles.newFolderInput}
            placeholder="Folder name"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename(f);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setRenamingId(null);
                setRenameDraft('');
              }
            }}
            onBlur={() => commitRename(f)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      );
    }
    const showActions =
      (hovered || alwaysShowFolderActions) &&
      (props.onDeleteFolder || props.onRenameFolder || props.onAddFolder);
    return (
      <div key={f.id}>
        <div
          className={navRowClass(active)}
          style={{
            ...navRowStyle(active, dense),
            paddingLeft: 10 + indent,
            ...dropHighlight(dropTargetId === f.id),
          }}
          onClick={() => onView({ kind: 'folder', id: f.id })}
          onMouseEnter={() => setHoverFolderId(f.id)}
          onMouseLeave={() => setHoverFolderId((h) => (h === f.id ? null : h))}
          {...makeDropHandlers(f.id, f.id)}
        >
          {/* Leading affordance: chevron-or-spacer + colour dot, tightly
              packed in their own 4px-gap subflex. Without this group the
              row's outer `gap: 8` accumulates twice (chevron→dot→name) and
              the label's leading inset balloons past the trailing inset of
              the count/actions slot. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {hasChildren ? (
              <button
                type="button"
                className="sn-icon-btn"
                aria-label={isCollapsed ? `Expand "${f.name}"` : `Collapse "${f.name}"`}
                style={{
                  ...styles.iconBtn,
                  width: 12,
                  height: 12,
                  // currentColor so the chevron belongs to the row's ink, not
                  // a permanent ink-4 annotation that ignores active/hover.
                  color: 'currentColor',
                  transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                  transition: 'transform 80ms ease-out',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapsed(f.id);
                }}
              >
                <IconChevronRight size={9} />
              </button>
            ) : (
              <span style={{ width: 12, flexShrink: 0 }} />
            )}
            {showDot && <span style={dotStyle(f.color)} />}
          </div>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {f.name}
          </span>
          {/* Fixed-width slot. Count and actions cross-fade in place — no
              layout jitter when the cursor moves on/off the row. */}
          <div style={styles.trailingSlot}>
            <span
              style={{
                ...countStyle,
                marginLeft: 0,
                position: 'absolute',
                right: 4,
                opacity: showActions ? 0 : 1,
                transition: 'opacity 80ms ease-out',
                pointerEvents: 'none',
              }}
            >
              {f.count}
            </span>
            <div
              style={{
                position: 'absolute',
                right: 0,
                display: 'flex',
                gap: 2,
                opacity: showActions ? 1 : 0,
                transition: 'opacity 80ms ease-out',
                pointerEvents: showActions ? 'auto' : 'none',
              }}
            >
              {props.onAddFolder && (
                <button
                  type="button"
                  className="sn-icon-btn"
                  aria-label={`Add subfolder under "${f.name}"`}
                  style={styles.iconBtn}
                  tabIndex={showActions ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddingUnder(f.id);
                    setDraftName('');
                    setCollapsed((prev) => {
                      if (!prev.has(f.id)) return prev;
                      const next = new Set(prev);
                      next.delete(f.id);
                      return next;
                    });
                  }}
                >
                  <IconPlus size={13} />
                </button>
              )}
              {props.onRenameFolder && (
                <button
                  type="button"
                  className="sn-icon-btn"
                  aria-label={`Rename folder "${f.name}"`}
                  style={styles.iconBtn}
                  tabIndex={showActions ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(f.id);
                    setRenameDraft(f.name);
                  }}
                >
                  <IconEdit size={13} />
                </button>
              )}
              {props.onDeleteFolder && (
                <button
                  type="button"
                  className="sn-icon-btn sn-icon-btn--danger"
                  aria-label={`Delete folder "${f.name}"`}
                  style={styles.iconBtn}
                  tabIndex={showActions ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDeleteFolder?.(f);
                  }}
                >
                  <IconTrash size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
        {addingUnder === f.id && (
          <div
            style={{
              ...styles.newFolderRow,
              paddingLeft: 10 + (node.depth + 1) * 12,
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ width: 12, flexShrink: 0 }} />
              <span style={dotStyle('var(--ink-4)')} />
            </div>
            <input
              autoFocus
              style={styles.newFolderInput}
              placeholder="New subfolder…"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDraft();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setAddingUnder(undefined);
                  setDraftName('');
                }
              }}
              onBlur={commitDraft}
            />
          </div>
        )}
        {hasChildren && !isCollapsed && node.children.map((c) => renderFolderNode(c))}
      </div>
    );
  };

  const commitRename = (folder: FolderDTO) => {
    const name = renameDraft.trim();
    if (name && name !== folder.name && props.onRenameFolder) {
      props.onRenameFolder(folder, name);
    }
    setRenamingId(null);
    setRenameDraft('');
  };

  const rootStyle: CSSProperties = fullWidth
    ? { ...styles.root, width: '100%', flexShrink: 1, borderRight: 0 }
    : styles.root;

  return (
    <aside style={rootStyle}>
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
            className={navRowClass(isActiveKind('all'))}
            style={{
              ...navRowStyle(isActiveKind('all'), dense),
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
            className={navRowClass(isActiveKind('pinned'))}
            style={navRowStyle(isActiveKind('pinned'), dense)}
            onClick={() => onView({ kind: 'pinned' })}
          >
            <IconPin size={15} style={{ color: isActiveKind('pinned') ? 'var(--berry)' : 'var(--ink-3)' }} />
            <span>Pinned</span>
            <span style={countStyle}>{props.pinnedCount}</span>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHead}>
            <span>Time</span>
          </div>
          {TIME_RANGES.map((range) => {
            const active = isActiveTime(range);
            return (
              <div
                key={range}
                className={navRowClass(active)}
                style={navRowStyle(active, dense)}
                onClick={() => onView({ kind: 'time', range })}
                title={`Notes updated — ${timeRangeLabel(range)}`}
              >
                <IconCalendar
                  size={15}
                  style={{ color: active ? 'var(--berry)' : 'var(--ink-3)' }}
                />
                <span>{timeRangeLabel(range)}</span>
              </div>
            );
          })}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHead}>
            <span>Folders</span>
            {props.onAddFolder && (
              <button
                type="button"
                className="sn-icon-btn"
                aria-label="New folder"
                style={{ ...styles.iconBtn, width: 18, height: 18 }}
                onClick={() => {
                  setAddingUnder(null);
                  setDraftName('');
                }}
              >
                <IconPlus size={12} />
              </button>
            )}
          </div>
          {addingUnder === null && (
            <div style={{ ...styles.newFolderRow, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ width: 12, flexShrink: 0 }} />
                <span style={dotStyle('var(--ink-4)')} />
              </div>
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
                    setAddingUnder(undefined);
                    setDraftName('');
                  }
                }}
                onBlur={commitDraft}
              />
            </div>
          )}
          {tree.map((node) => renderFolderNode(node))}
        </div>

        {tags.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionHead}>
              <span>Tags</span>
            </div>
            <div style={styles.tagCloud}>
              {tags.map((t) => {
                const active = isActiveTag(t.id);
                return (
                  <span
                    key={t.id}
                    className={active ? 'sn-tag-chip sn-tag-chip--active' : 'sn-tag-chip'}
                    style={tagChipStyle(active)}
                    onClick={() => onView(active ? { kind: 'all' } : { kind: 'tag', id: t.id })}
                  >
                    #{t.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div style={styles.section}>
          <div
            className={navRowClass(isActiveKind('trash'))}
            style={navRowStyle(isActiveKind('trash'), dense)}
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
        <Link href="/settings" title="Settings" style={styles.footBtn}>
          <IconCog size={15} />
        </Link>
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

export const Sidebar = memo(SidebarImpl);
