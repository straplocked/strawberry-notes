'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNoteTitles } from '@/lib/api/hooks';
import { matchTitles } from '@/lib/editor/wiki-link';

export interface WikiLinkPopupProps {
  /** Query string (text after `[[`). */
  query: string;
  /** Screen coords of the `[[` trigger; popup positions below `bottom`. */
  coords: { left: number; top: number; bottom: number };
  /** User picked a title — host inserts `[[title]]` into the editor. */
  onPick: (titleOrNewTitle: string, id: string | null) => void;
  /** User pressed Escape / clicked away — host closes the popup. */
  onDismiss: () => void;
  /** Bridge so the host can forward editor keys into the popup. */
  keyHandlerRef: React.MutableRefObject<((e: KeyboardEvent) => boolean) | null>;
}

const POPUP_WIDTH = 240;
const ITEM_HEIGHT = 30;
const MAX_ITEMS = 8;

const popupStyle = (left: number, top: number): CSSProperties => ({
  position: 'fixed',
  left,
  top,
  width: POPUP_WIDTH,
  maxHeight: ITEM_HEIGHT * MAX_ITEMS + 12,
  overflowY: 'auto',
  background: 'var(--surface)',
  border: '1px solid var(--hair)',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
  padding: 4,
  zIndex: 1000,
  fontSize: 13,
});

const itemStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: ITEM_HEIGHT,
  padding: '0 10px',
  borderRadius: 6,
  cursor: 'pointer',
  background: active ? 'var(--berry-soft)' : 'transparent',
  color: active ? 'var(--berry-ink)' : 'var(--ink-2)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

const emptyStyle: CSSProperties = {
  padding: '10px 12px',
  color: 'var(--ink-3)',
  fontSize: 12,
  fontStyle: 'italic',
};

const hintStyle: CSSProperties = {
  padding: '6px 10px 4px',
  color: 'var(--ink-4)',
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

export function WikiLinkPopup({
  query,
  coords,
  onPick,
  onDismiss,
  keyHandlerRef,
}: WikiLinkPopupProps) {
  // Debounce the network query so keystrokes don't each fire a request.
  const [netQuery, setNetQuery] = useState(query);
  useEffect(() => {
    const t = window.setTimeout(() => setNetQuery(query), 100);
    return () => window.clearTimeout(t);
  }, [query]);

  const { data: raw } = useNoteTitles(netQuery, true);
  const candidates = raw ?? [];

  // Further rank client-side using the up-to-date query (the debounced
  // network response may lag a character behind; matchTitles is cheap).
  const results = matchTitles(query, candidates, MAX_ITEMS);

  // The raw selection index. Clamped to a valid slot during render (below)
  // rather than being reset from an effect on every query change — which
  // would cascade renders and draws an eslint error under the React
  // Compiler ruleset.
  const [rawActive, setRawActive] = useState(0);
  const active = results.length === 0 ? 0 : Math.min(rawActive, results.length - 1);

  // Handle keystrokes bubbling in from the editor (forwarded via ref).
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        setRawActive(Math.min(active + 1, Math.max(0, results.length - 1)));
        return true;
      }
      if (e.key === 'ArrowUp') {
        setRawActive(Math.max(active - 1, 0));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const pick = results[active];
        if (pick) {
          onPick(pick.title, pick.id);
        } else if (query.trim().length > 0) {
          // No result yet but the user typed a title — insert verbatim.
          onPick(query.trim(), null);
        } else {
          return false;
        }
        return true;
      }
      if (e.key === 'Escape') {
        onDismiss();
        return true;
      }
      return false;
    };
    return () => {
      keyHandlerRef.current = null;
    };
  }, [active, results, query, onPick, onDismiss, keyHandlerRef]);

  // Clamp popup into the viewport so it doesn't disappear off-screen on
  // small windows / when the caret is near the right edge.
  const ref = useRef<HTMLDivElement | null>(null);
  const left =
    typeof window === 'undefined'
      ? coords.left
      : Math.max(8, Math.min(coords.left, window.innerWidth - POPUP_WIDTH - 8));
  const top = coords.bottom + 4;

  return (
    <div ref={ref} style={popupStyle(left, top)} data-testid="wiki-link-popup">
      <div style={hintStyle}>
        {query ? `Link to "${query}"` : 'Link to a note'}
      </div>
      {results.length === 0 ? (
        <div style={emptyStyle}>
          {query.trim()
            ? 'No match — press Enter to insert as-is'
            : 'No notes yet'}
        </div>
      ) : (
        results.map((r, i) => (
          <div
            key={r.id}
            style={itemStyle(i === active)}
            onMouseEnter={() => setRawActive(i)}
            onMouseDown={(e) => {
              // mousedown so we fire before the editor loses focus on click.
              e.preventDefault();
              onPick(r.title, r.id);
            }}
            data-testid="wiki-link-option"
          >
            {r.title || 'Untitled'}
          </div>
        ))
      )}
    </div>
  );
}
