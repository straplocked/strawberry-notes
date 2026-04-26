'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { IconX } from '@/components/icons';
import { dlog } from '@/lib/debug';
import type { TagDTO } from '@/lib/types';

/**
 * Inline tag editor for the note metadata header.
 *
 * Behaviour:
 *   - Renders the current tag names as chips with an `×` remove button on
 *     hover/focus.
 *   - A trailing input lets the user type a new tag. Enter or comma commits.
 *     Backspace on an empty input removes the last chip.
 *   - While the input has content, an autocomplete popover lists matching
 *     existing tags + a "Create '<name>'" option when the typed value isn't
 *     already in `value`. ↑/↓ to navigate, Enter to pick, Escape to dismiss.
 *   - Tag names are normalised to trimmed-lowercase before being passed to
 *     `onChange` — matches the server (`lib/notes/tag-resolution.ts`).
 *
 * `available` is the user's full tag library — already loaded by the AppShell
 * for the sidebar's tag cloud, so passing it down here costs nothing extra.
 */
export interface TagEditorProps {
  /** Current tag names (lowercase, deduped). */
  value: string[];
  /** All tags the user has, used for autocomplete. */
  available: TagDTO[];
  /** Called with the new full list of names whenever it changes. */
  onChange: (names: string[]) => void;
  /** When true, render chips read-only and hide the input. */
  readOnly?: boolean;
  /** Override placeholder text. */
  placeholder?: string;
}

const MAX_TAG_LEN = 40;
const MAX_SUGGESTIONS = 8;

function normalise(raw: string): string {
  return raw.trim().toLowerCase().slice(0, MAX_TAG_LEN);
}

const rowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 6,
  position: 'relative',
};

const chipBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '2px 4px 3px 8px',
  borderRadius: 999,
  background: 'var(--berry-soft)',
  color: 'var(--berry-ink)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  border: '1px solid transparent',
  textTransform: 'none',
  letterSpacing: 0,
};

const removeBtnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  borderRadius: 999,
  background: 'transparent',
  border: 0,
  color: 'var(--berry-ink)',
  cursor: 'pointer',
  padding: 0,
  marginLeft: 1,
  opacity: 0.6,
};

const inputStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--ink-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  padding: '2px 4px 3px 4px',
  width: 90,
  textTransform: 'lowercase',
  letterSpacing: 0,
};

const popoverStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  zIndex: 30,
  background: 'var(--surface)',
  border: '1px solid var(--hair-2)',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
  padding: 4,
  minWidth: 160,
  maxWidth: 240,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  textTransform: 'none',
  letterSpacing: 0,
};

function suggestionStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '5px 8px',
    borderRadius: 5,
    background: active ? 'var(--berry-soft)' : 'transparent',
    color: active ? 'var(--berry-ink)' : 'var(--ink-2)',
    cursor: 'pointer',
    userSelect: 'none',
  };
}

interface Suggestion {
  /** Lowercase tag name to commit. */
  name: string;
  /** True when the suggestion would create a new tag (vs use an existing one). */
  fresh: boolean;
}

function buildSuggestions(
  query: string,
  available: TagDTO[],
  current: string[],
): Suggestion[] {
  const q = normalise(query);
  if (!q) return [];
  const taken = new Set(current);
  const matches = available
    .filter((t) => !taken.has(t.name) && t.name.includes(q))
    // Prefix matches first, then includes; alpha within each group.
    .sort((a, b) => {
      const aPrefix = a.name.startsWith(q) ? 0 : 1;
      const bPrefix = b.name.startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.name.localeCompare(b.name);
    })
    .slice(0, MAX_SUGGESTIONS)
    .map<Suggestion>((t) => ({ name: t.name, fresh: false }));

  const exactExists = available.some((t) => t.name === q);
  const alreadyOnNote = taken.has(q);
  if (!exactExists && !alreadyOnNote) {
    matches.push({ name: q, fresh: true });
  }
  return matches.slice(0, MAX_SUGGESTIONS);
}

export function TagEditor({
  value,
  available,
  onChange,
  readOnly = false,
  placeholder = '+ tag',
}: TagEditorProps) {
  const [draft, setDraft] = useState('');
  // The raw highlight index — may be out of range after the suggestions list
  // shrinks. We clamp at read time (`activeIdx` below) so we don't need a
  // setState-inside-effect dance to keep them aligned.
  const [rawActiveIdx, setRawActiveIdx] = useState(0);
  const [hoverChip, setHoverChip] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const suggestions = useMemo(
    () => buildSuggestions(draft, available, value),
    [draft, available, value],
  );
  const activeIdx =
    suggestions.length === 0 ? 0 : Math.min(rawActiveIdx, suggestions.length - 1);

  const commit = useCallback(
    (raw: string) => {
      const name = normalise(raw);
      if (!name) return;
      if (value.includes(name)) {
        setDraft('');
        return;
      }
      dlog('ui', 'tag: add', { name });
      onChange([...value, name]);
      setDraft('');
      setRawActiveIdx(0);
    },
    [onChange, value],
  );

  const remove = useCallback(
    (name: string) => {
      dlog('ui', 'tag: remove', { name });
      onChange(value.filter((n) => n !== name));
    },
    [onChange, value],
  );

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Backspace on an empty draft removes the last chip — mirrors the
      // pattern in most chip inputs (Gmail recipients, Linear labels, etc.).
      if (e.key === 'Backspace' && draft.length === 0 && value.length > 0) {
        e.preventDefault();
        remove(value[value.length - 1]);
        return;
      }
      if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
        if (suggestions.length > 0 && draft.length > 0) {
          e.preventDefault();
          commit(suggestions[activeIdx]?.name ?? draft);
          return;
        }
        if (draft.length > 0) {
          e.preventDefault();
          commit(draft);
          return;
        }
      }
      if (e.key === 'ArrowDown') {
        if (suggestions.length === 0) return;
        e.preventDefault();
        setRawActiveIdx((activeIdx + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        if (suggestions.length === 0) return;
        e.preventDefault();
        setRawActiveIdx((activeIdx - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Escape') {
        setDraft('');
      }
    },
    [activeIdx, commit, draft, remove, suggestions, value],
  );

  return (
    <span style={rowStyle}>
      {value.map((name) => {
        const hovered = hoverChip === name;
        return (
          <span
            key={name}
            style={chipBase}
            onMouseEnter={() => setHoverChip(name)}
            onMouseLeave={() => setHoverChip((h) => (h === name ? null : h))}
          >
            #{name}
            {!readOnly && (
              <button
                type="button"
                aria-label={`Remove tag ${name}`}
                style={{ ...removeBtnBase, opacity: hovered ? 0.95 : 0.55 }}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(name);
                }}
              >
                <IconX size={9} />
              </button>
            )}
          </span>
        );
      })}

      {!readOnly && (
        <span style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            placeholder={value.length === 0 ? placeholder : ''}
            aria-label="Add tag"
            spellCheck={false}
            autoComplete="off"
            style={inputStyle}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => {
              // Defer so a click on a suggestion can win the race.
              setTimeout(() => setDraft(''), 100);
            }}
            maxLength={MAX_TAG_LEN}
          />
          {draft.length > 0 && suggestions.length > 0 && (
            <div role="listbox" style={popoverStyle}>
              {suggestions.map((s, i) => (
                <div
                  key={`${s.name}:${s.fresh ? 'new' : 'old'}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  style={suggestionStyle(i === activeIdx)}
                  // onMouseDown so we beat the input's onBlur clearing draft.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(s.name);
                  }}
                  onMouseEnter={() => setRawActiveIdx(i)}
                >
                  <span>#{s.name}</span>
                  {s.fresh && <span style={{ opacity: 0.6, fontSize: 10 }}>new</span>}
                </div>
              ))}
            </div>
          )}
        </span>
      )}
    </span>
  );
}
