'use client';

import type { CSSProperties } from 'react';
import { IconSearch, IconShare } from '@/components/icons';

export type MobilePane = 'folders' | 'list' | 'editor';

const barStyleList: CSSProperties = {
  padding: '6px 14px 14px',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--hair)',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const barStyleEditor: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px 14px',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--hair)',
  flexShrink: 0,
};

const wellStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  border: 0,
  background: 'var(--surface-2)',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.2)',
  padding: 0,
};

const iconBtnStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  border: 0,
  background: 'var(--surface-2)',
  color: 'var(--ink-2)',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
};

const searchFieldStyle: CSSProperties = {
  flex: 1,
  height: 40,
  borderRadius: 14,
  background: 'var(--surface-2)',
  border: '1px solid var(--hair)',
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  gap: 9,
  minWidth: 0,
};

const searchInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 0,
  outline: 'none',
  background: 'transparent',
  fontSize: 14,
  color: 'var(--ink)',
  fontFamily: 'inherit',
};

const folderChipStyle: CSSProperties = {
  fontSize: 9.5,
  color: 'var(--ink-3)',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 999,
  background: 'var(--bg)',
  border: '1px solid var(--hair)',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const editorFolderPillStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 40,
  border: 0,
  background: 'var(--surface-2)',
  borderRadius: 14,
  padding: '0 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  cursor: 'pointer',
  color: 'var(--ink-2)',
};

const editorFolderName: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  color: 'var(--ink)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
};

const editorUpdatedTag: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 9.5,
  color: 'var(--ink-4)',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

function BackChev({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 6 9 12l6 6" />
    </svg>
  );
}

// Brand mark — richer treatment than IconBerry: radial gradient, scattered
// seeds, notched calyx with stem. Direct port of sn-mobile.jsx:64-86.
function BerryMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: 'block' }}>
      <defs>
        <radialGradient id="sn-berry-grad" cx="35%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#f06478" />
          <stop offset="55%" stopColor="#e33d4e" />
          <stop offset="100%" stopColor="#b02537" />
        </radialGradient>
      </defs>
      <path
        d="M24 44 C 12 44, 6 32, 7 24 C 8 18, 13 14, 18 13 C 20.5 12.5, 22 13, 24 13 C 26 13, 27.5 12.5, 30 13 C 35 14, 40 18, 41 24 C 42 32, 36 44, 24 44 Z"
        fill="url(#sn-berry-grad)"
      />
      <g fill="#fde9a5" opacity={0.95}>
        <ellipse cx="17" cy="22" rx="1.1" ry="1.6" />
        <ellipse cx="22" cy="20" rx="1.1" ry="1.6" />
        <ellipse cx="28" cy="22" rx="1.1" ry="1.6" />
        <ellipse cx="33" cy="25" rx="1.1" ry="1.6" />
        <ellipse cx="19" cy="28" rx="1.1" ry="1.6" />
        <ellipse cx="25" cy="29" rx="1.1" ry="1.6" />
        <ellipse cx="31" cy="31" rx="1.1" ry="1.6" />
        <ellipse cx="22" cy="35" rx="1.1" ry="1.6" />
        <ellipse cx="28" cy="36" rx="1.1" ry="1.6" />
        <ellipse cx="25" cy="40" rx="1.1" ry="1.6" />
      </g>
      <path
        d="M24 6 L 19 12 L 14 11 L 17 15 L 12 17 L 18 18 L 24 14 L 30 18 L 36 17 L 31 15 L 34 11 L 29 12 Z"
        fill="#4fa85a"
      />
      <path
        d="M24 6 L 19 12 L 14 11 L 17 15 L 12 17 L 18 18 L 24 14 L 30 18 L 36 17 L 31 15 L 34 11 L 29 12 Z"
        fill="none"
        stroke="#3a8547"
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
      <rect x="23.2" y="3" width="1.6" height="5" rx="0.8" fill="#3a8547" />
    </svg>
  );
}

export interface MobileTopBarProps {
  pane: MobilePane;
  // List + folders variant
  search: string;
  onSearch: (q: string) => void;
  folderLabel: string;
  onBrandTap: () => void;
  // Editor variant
  editorFolderName?: string;
  editorFolderColor?: string;
  editorUpdatedLabel?: string;
  onBackToList: () => void;
  onTapEditorFolderPill?: () => void;
  onOpenEditorActions?: () => void;
}

export function MobileTopBar(props: MobileTopBarProps) {
  if (props.pane === 'editor') return <EditorBar {...props} />;
  return <ListBar {...props} />;
}

function ListBar({ search, onSearch, folderLabel, onBrandTap }: MobileTopBarProps) {
  return (
    <div style={barStyleList} className="safe-top safe-x">
      <button
        type="button"
        style={wellStyle}
        onClick={onBrandTap}
        aria-label="Notes home"
        title="Go to all notes"
      >
        <BerryMark size={28} />
      </button>
      <div style={searchFieldStyle}>
        <span style={{ width: 16, height: 16, color: 'var(--ink-3)', flexShrink: 0, display: 'inline-flex' }}>
          <IconSearch size={16} strokeWidth={1.9} />
        </span>
        <input
          data-mobile-search="true"
          style={searchInputStyle}
          placeholder="Search notes"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="off"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <span style={folderChipStyle}>{folderLabel}</span>
      </div>
    </div>
  );
}

function EditorBar({
  editorFolderName: name = 'Unfiled',
  editorFolderColor: color = 'var(--ink-4)',
  editorUpdatedLabel: updated = '',
  onBackToList,
  onTapEditorFolderPill,
  onOpenEditorActions,
}: MobileTopBarProps) {
  return (
    <div style={barStyleEditor} className="safe-top safe-x">
      <button type="button" style={iconBtnStyle} onClick={onBackToList} aria-label="Back">
        <BackChev size={22} />
      </button>
      <button
        type="button"
        style={editorFolderPillStyle}
        onClick={onTapEditorFolderPill ?? onBackToList}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
            boxShadow: `0 0 0 3px ${color}33`,
          }}
        />
        <span style={editorFolderName}>{name}</span>
        {updated && <span style={editorUpdatedTag}>edited {updated}</span>}
      </button>
      <button
        type="button"
        style={iconBtnStyle}
        onClick={onOpenEditorActions}
        aria-label="Note actions"
        title="Note actions"
      >
        <IconShare size={19} strokeWidth={1.9} />
      </button>
    </div>
  );
}
