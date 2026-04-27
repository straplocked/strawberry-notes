'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useDeleteTag, usePatchTag, useTags } from '@/lib/api/hooks';
import type { TagDTO } from '@/lib/types';

const styles: Record<string, CSSProperties> = {
  section: {
    background: 'var(--surface)',
    border: '1px solid var(--hair)',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  },
  h2: {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
    letterSpacing: '-0.01em',
  },
  help: {
    color: 'var(--ink-3)',
    fontSize: 13,
    lineHeight: 1.5,
    marginTop: 6,
    marginBottom: 20,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  // Layout-only base. Background, border, and hover come from `.sn-list-row`
  // in globals.css so :hover composes with the inline styles.
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 13,
  },
  hash: { color: 'var(--ink-4)', flexShrink: 0 },
  name: {
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  count: {
    color: 'var(--ink-4)',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    background: 'var(--surface)',
    border: '1px solid var(--hair-2)',
    borderRadius: 6,
    color: 'var(--ink)',
    padding: '4px 8px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
  },
  // Layout-only base for ghost buttons. Paint comes from `.sn-btn-ghost[--danger]`.
  btnBase: {
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  empty: { color: 'var(--ink-4)', fontSize: 13, fontStyle: 'italic', padding: '16px 0' },
};

export function TagsSection() {
  const tagsQ = useTags();
  const patchTag = usePatchTag();
  const deleteTag = useDeleteTag();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tags = useMemo(() => tagsQ.data ?? [], [tagsQ.data]);
  const tagNames = useMemo(() => new Set(tags.map((t) => t.name.toLowerCase())), [tags]);
  const busyId = patchTag.isPending
    ? (patchTag.variables?.id ?? null)
    : deleteTag.isPending
      ? (deleteTag.variables ?? null)
      : null;

  const startRename = (t: TagDTO) => {
    setEditingId(t.id);
    setDraft(t.name);
    setError(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setDraft('');
  };

  const commitRename = (t: TagDTO) => {
    const next = draft.trim().toLowerCase();
    if (!next || next === t.name) {
      cancelRename();
      return;
    }
    if (next.length > 40) {
      setError('Tag names are limited to 40 characters.');
      return;
    }

    // Detect a merge so we can warn before committing — the server does it
    // either way, but a confirmation here keeps the action obvious.
    const wouldMerge = tagNames.has(next);
    if (wouldMerge) {
      const ok = window.confirm(
        `A tag "#${next}" already exists. ` +
          `Renaming "#${t.name}" to "#${next}" will merge them — every note tagged "#${t.name}" will be tagged "#${next}", and "#${t.name}" will be removed. Continue?`,
      );
      if (!ok) return;
    }

    setError(null);
    patchTag.mutate(
      { id: t.id, name: next },
      {
        onSuccess: cancelRename,
        onError: (e) => setError((e as Error).message),
      },
    );
  };

  const onDelete = (t: TagDTO) => {
    const ok = window.confirm(
      `Delete the "#${t.name}" tag? It will be removed from all ${t.count} note${t.count === 1 ? '' : 's'} that have it; the notes themselves stay.`,
    );
    if (!ok) return;
    setError(null);
    deleteTag.mutate(t.id, {
      onError: (e) => setError((e as Error).message),
    });
  };

  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>Tags</h2>
      <p style={styles.help}>
        Rename merges into existing tags. Delete removes the tag from every note; the notes stay.
      </p>

      {error && (
        <p style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 12 }}>{error}</p>
      )}

      {tagsQ.isPending && !tagsQ.data ? (
        <p style={styles.empty}>Loading…</p>
      ) : tags.length === 0 ? (
        <p style={styles.empty}>No tags yet.</p>
      ) : (
        <div style={styles.list}>
          {tags.map((t) => {
            const editing = editingId === t.id;
            const busy = busyId === t.id;
            return (
              <div key={t.id} className="sn-list-row" style={styles.row}>
                <span style={styles.hash}>#</span>
                {editing ? (
                  <input
                    autoFocus
                    style={styles.input}
                    value={draft}
                    maxLength={40}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename(t);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    disabled={busy}
                  />
                ) : (
                  <span style={styles.name}>{t.name}</span>
                )}
                <span style={styles.count}>
                  {t.count} note{t.count === 1 ? '' : 's'}
                </span>
                {editing ? (
                  <>
                    <button
                      className="sn-btn-ghost"
                      style={styles.btnBase}
                      onClick={() => commitRename(t)}
                      disabled={busy}
                      type="button"
                    >
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      className="sn-btn-ghost"
                      style={styles.btnBase}
                      onClick={cancelRename}
                      disabled={busy}
                      type="button"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="sn-btn-ghost"
                      style={styles.btnBase}
                      onClick={() => startRename(t)}
                      disabled={busy}
                      type="button"
                    >
                      Rename
                    </button>
                    <button
                      className="sn-btn-ghost sn-btn-ghost--danger"
                      style={styles.btnBase}
                      onClick={() => onDelete(t)}
                      disabled={busy}
                      type="button"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
