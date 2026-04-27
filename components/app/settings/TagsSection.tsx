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
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    fontSize: 13,
  },
  name: { fontWeight: 600 },
  count: {
    color: 'var(--ink-4)',
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
  },
  spacer: { flex: 1 },
  input: {
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
  btnGhost: {
    background: 'transparent',
    color: 'var(--ink-3)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
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
      `Delete the "#${t.name}" tag? The tag will be removed from all ${t.count} note${t.count === 1 ? '' : 's'} that have it; the notes themselves are kept.`,
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
        Rename or merge tags here. Renaming to a name that already exists merges the two — every
        note that had the old tag gets the existing tag instead. Deleting a tag removes it from all
        notes; the notes themselves stay.
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
              <div key={t.id} style={styles.row}>
                <span style={{ color: 'var(--ink-4)' }}>#</span>
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
                <span style={styles.spacer} />
                <span style={styles.count}>
                  {t.count} note{t.count === 1 ? '' : 's'}
                </span>
                {editing ? (
                  <>
                    <button
                      style={styles.btnGhost}
                      onClick={() => commitRename(t)}
                      disabled={busy}
                      type="button"
                    >
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      style={styles.btnGhost}
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
                      style={styles.btnGhost}
                      onClick={() => startRename(t)}
                      disabled={busy}
                      type="button"
                    >
                      Rename
                    </button>
                    <button
                      style={styles.btnGhost}
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
