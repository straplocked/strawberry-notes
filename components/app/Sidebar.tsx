'use client';

import type { CSSProperties } from 'react';
import {
  IconAll,
  IconBerry,
  IconMoon,
  IconPin,
  IconPlus,
  IconSun,
  IconTrash,
} from '@/components/icons';
import type { Density } from '@/lib/design/accents';
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
  onAddFolder?: () => void;
}

export function Sidebar(props: SidebarProps) {
  const { folders, tags, view, onView, density } = props;
  const dense = density === 'dense';
  const isActiveKind = (k: FolderView['kind']) => view.kind === k;
  const isActiveFolder = (id: string) => view.kind === 'folder' && view.id === id;
  const isActiveTag = (id: string) => view.kind === 'tag' && view.id === id;

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
          <div style={itemStyle(isActiveKind('all'), dense)} onClick={() => onView({ kind: 'all' })}>
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
                onClick={props.onAddFolder}
              />
            )}
          </div>
          {folders.map((f) => (
            <div
              key={f.id}
              style={itemStyle(isActiveFolder(f.id), dense)}
              onClick={() => onView({ kind: 'folder', id: f.id })}
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
              <span style={countStyle}>{f.count}</span>
            </div>
          ))}
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
      </div>
    </aside>
  );
}
