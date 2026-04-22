'use client';

import type { CSSProperties } from 'react';
import { IconPinFill, IconSearch, IconX } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { drender } from '@/lib/debug';
import { DRAG_MIME } from '@/lib/dnd';
import type { Density } from '@/lib/design/accents';
import type { NoteListItemDTO, TagDTO } from '@/lib/types';

const styles: Record<string, CSSProperties> = {
  root: {
    width: 300,
    flexShrink: 0,
    background: 'var(--surface)',
    borderRight: '1px solid var(--hair)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  head: {
    padding: '16px 16px 10px',
    borderBottom: '1px solid var(--hair)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  titleRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 22,
    fontWeight: 600,
    color: 'var(--ink)',
    lineHeight: 1,
    letterSpacing: '-0.02em',
  },
  count: { fontSize: 11, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' },
  search: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    background: 'var(--surface-2)',
    borderRadius: 8,
    border: '1px solid var(--hair)',
  },
  searchInput: {
    border: 0,
    outline: 'none',
    background: 'transparent',
    flex: 1,
    fontSize: 12.5,
    color: 'var(--ink)',
  },
  scroll: { flex: 1, overflowY: 'auto' },
  empty: { padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5 },
  pinMark: { color: 'var(--berry)', display: 'inline-flex' },
  tag: {
    fontSize: 10,
    padding: '2px 7px 3px',
    borderRadius: 999,
    background: 'var(--surface-2)',
    color: 'var(--ink-3)',
    border: '1px solid var(--hair)',
    fontFamily: 'var(--font-mono)',
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 6,
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    flexShrink: 0,
    marginLeft: 10,
    backgroundImage:
      'repeating-linear-gradient(45deg, transparent 0 6px, rgba(0,0,0,0.04) 6px 7px)',
  },
};

function itemStyle(active: boolean, dense: boolean): CSSProperties {
  return {
    padding: dense ? '10px 16px' : '14px 16px 14px',
    borderBottom: '1px solid var(--hair)',
    cursor: 'pointer',
    background: active ? 'var(--berry-soft)' : 'transparent',
    position: 'relative',
  };
}

function leftBarStyle(active: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    background: active ? 'var(--berry)' : 'transparent',
  };
}

function titleStyle(dense: boolean): CSSProperties {
  return {
    fontSize: dense ? 13 : 13.5,
    fontWeight: 600,
    color: 'var(--ink)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: dense ? 2 : 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}

const metaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 9.5,
  color: 'var(--berry)',
  fontVariantNumeric: 'tabular-nums',
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  fontWeight: 500,
  marginBottom: 4,
};

function snippetStyle(dense: boolean): CSSProperties {
  return {
    fontSize: 12,
    color: 'var(--ink-3)',
    lineHeight: 1.45,
    display: '-webkit-box',
    WebkitLineClamp: dense ? 1 : 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    marginTop: dense ? 2 : 4,
  };
}

const itemTagsStyle: CSSProperties = { display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' };

export interface NoteListProps {
  notes: NoteListItemDTO[];
  tags: TagDTO[];
  activeFolderName: string;
  activeNoteId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (q: string) => void;
  density: Density;
}

export function NoteList({
  notes,
  tags,
  activeFolderName,
  activeNoteId,
  onSelect,
  search,
  onSearch,
  density,
}: NoteListProps) {
  drender('NoteList', {
    count: notes.length,
    activeNoteId,
    search: search || undefined,
    folder: activeFolderName,
  });
  const dense = density === 'dense';
  const tagById = new Map(tags.map((t) => [t.id, t]));
  return (
    <div style={styles.root}>
      <div style={styles.head}>
        <div style={styles.titleRow}>
          <span style={styles.title}>{activeFolderName}</span>
          <span style={styles.count}>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </span>
        </div>
        <div style={styles.search}>
          <IconSearch size={13} style={{ color: 'var(--ink-4)' }} />
          <input
            style={styles.searchInput}
            placeholder="Search notes"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          {search && (
            <IconX
              size={12}
              style={{ color: 'var(--ink-4)', cursor: 'pointer' }}
              onClick={() => onSearch('')}
            />
          )}
        </div>
      </div>
      <div style={styles.scroll}>
        {notes.length === 0 && (
          <div style={styles.empty}>
            No notes here yet.
            <br />
            Start one with{' '}
            <span
              className="mono"
              style={{
                background: 'var(--surface-2)',
                padding: '1px 6px',
                borderRadius: 4,
                border: '1px solid var(--hair)',
              }}
            >
              ⌘N
            </span>
            .
          </div>
        )}
        {notes.map((n) => {
          const active = activeNoteId === n.id;
          return (
            <div
              key={n.id}
              style={itemStyle(active, dense)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, n.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => onSelect(n.id)}
            >
              <div style={leftBarStyle(active)} />
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={titleStyle(dense)}>
                    {n.pinned && (
                      <span style={styles.pinMark}>
                        <IconPinFill size={11} />
                      </span>
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {n.title || 'Untitled'}
                    </span>
                  </div>
                  <div style={metaStyle}>
                    <span>{formatDate(n.updatedAt)}</span>
                    {dense && n.tagIds.length > 0 && (
                      <>
                        <span style={{ color: 'var(--ink-4)' }}>·</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                          #{tagById.get(n.tagIds[0])?.name}
                        </span>
                      </>
                    )}
                  </div>
                  <div style={snippetStyle(dense)}>{n.snippet || 'No additional text'}</div>
                  {!dense && n.tagIds.length > 0 && (
                    <div style={itemTagsStyle}>
                      {n.tagIds.map((tid) => {
                        const t = tagById.get(tid);
                        return t ? (
                          <span key={tid} style={styles.tag}>
                            #{t.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
                {!dense && n.hasImage && <div style={styles.thumb} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
