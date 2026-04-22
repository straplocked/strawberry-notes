'use client';

import type { CSSProperties } from 'react';
import { IconPlus, IconX } from '@/components/icons';

export type MobilePane = 'folders' | 'list' | 'editor';

const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  minHeight: 44,
  borderBottom: '1px solid var(--hair)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  flexShrink: 0,
};

const btnStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: 0,
  background: 'transparent',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
};

const titleStyle: CSSProperties = {
  flex: 1,
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--ink)',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  padding: '0 4px',
};

function HamburgerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function BackIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

export interface MobileTopBarProps {
  pane: MobilePane;
  title: string;
  onOpenFolders: () => void;
  onCloseFolders: () => void;
  onBackToList: () => void;
  onNewNote: () => void;
}

export function MobileTopBar({
  pane,
  title,
  onOpenFolders,
  onCloseFolders,
  onBackToList,
  onNewNote,
}: MobileTopBarProps) {
  return (
    <div style={barStyle} className="safe-top safe-x">
      {pane === 'list' && (
        <button style={btnStyle} onClick={onOpenFolders} type="button" aria-label="Open folders">
          <HamburgerIcon />
        </button>
      )}
      {pane === 'editor' && (
        <button style={btnStyle} onClick={onBackToList} type="button" aria-label="Back">
          <BackIcon />
        </button>
      )}
      {pane === 'folders' && (
        <button style={btnStyle} onClick={onCloseFolders} type="button" aria-label="Close folders">
          <IconX size={18} />
        </button>
      )}

      <span style={titleStyle}>{title}</span>

      {pane === 'list' ? (
        <button style={btnStyle} onClick={onNewNote} type="button" aria-label="New note">
          <IconPlus size={18} />
        </button>
      ) : (
        <span style={{ ...btnStyle, visibility: 'hidden' }} aria-hidden="true" />
      )}
    </div>
  );
}
