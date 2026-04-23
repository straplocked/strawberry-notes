'use client';

import { type CSSProperties } from 'react';
import { useBacklinks } from '@/lib/api/hooks';
import { useUIStore } from '@/lib/store/ui-store';

const wrap: CSSProperties = {
  marginTop: 40,
  paddingTop: 18,
  borderTop: '1px solid var(--hair)',
};

const heading: CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.16em',
  fontWeight: 600,
  color: 'var(--ink-3)',
  margin: '0 0 10px',
};

const row: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 0,
  background: 'transparent',
  padding: '8px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'inherit',
};

const title: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--ink)',
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const snippet: CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-3)',
  marginTop: 2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export function BacklinksPanel({ noteId }: { noteId: string }) {
  const { data, isLoading } = useBacklinks(noteId);
  const setActiveNoteId = useUIStore((s) => s.setActiveNoteId);

  if (isLoading || !data || data.length === 0) return null;

  return (
    <div style={wrap}>
      <h3 style={heading}>Linked from {data.length}</h3>
      <div>
        {data.map((b) => (
          <button
            key={b.id}
            type="button"
            style={row}
            onClick={() => setActiveNoteId(b.id)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <span style={title}>{b.title || 'Untitled'}</span>
            {b.snippet && <span style={snippet}>{b.snippet}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
