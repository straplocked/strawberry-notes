'use client';

import { useEffect, useState, type CSSProperties } from 'react';

interface TokenSummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface IssuedToken extends TokenSummary {
  token: string;
}

const styles: Record<string, CSSProperties> = {
  section: {
    background: 'var(--surface)',
    border: '1px solid var(--hair)',
    borderRadius: 12,
    padding: 24,
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
  form: { display: 'flex', gap: 8, marginBottom: 24 },
  input: {
    flex: 1,
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--ink)',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  btnPrimary: {
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
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
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    fontSize: 13,
  },
  meta: { color: 'var(--ink-3)', fontSize: 11 },
  empty: { color: 'var(--ink-4)', fontSize: 13, fontStyle: 'italic', padding: '16px 0' },
  tokenBox: {
    marginTop: 16,
    padding: 14,
    background: 'var(--surface-2)',
    border: '1px solid var(--accent)',
    borderRadius: 10,
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
    fontSize: 12,
    wordBreak: 'break-all',
  },
  warn: {
    marginTop: 8,
    color: 'var(--ink-3)',
    fontSize: 12,
    lineHeight: 1.5,
  },
  mono: { fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)', fontSize: 12 },
};

function fmt(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toLocaleString();
}

export function TokensSection() {
  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reloadTick, setReloadTick] = useState(0);
  const refresh = () => setReloadTick((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tokens', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TokenSummary[];
        if (!cancelled) setTokens(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as IssuedToken;
      setIssued(data);
      setName('');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (id: string) => {
    if (!window.confirm('Revoke this token? Any client using it will stop working.')) return;
    const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
    if (res.ok) refresh();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>Personal Access Tokens</h2>
      <p style={styles.help}>
        Tokens let programmatic clients (e.g. MCP-compatible AI assistants) act on your notes. A
        token carries the same permissions as your account — treat it like a password.{' '}
        <strong>Private Notes are never visible to tokens</strong> — agents and the web clipper
        only see your plaintext notes.
      </p>

      <form onSubmit={onCreate} style={styles.form}>
        <input
          style={styles.input}
          placeholder="Token name (e.g. Claude Desktop)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        <button type="submit" style={styles.btnPrimary} disabled={creating || !name.trim()}>
          {creating ? 'Creating…' : 'Create token'}
        </button>
      </form>

      {issued && (
        <div style={styles.tokenBox}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontFamily: 'var(--font-body)' }}>
            {issued.name} — copy this now, it won’t be shown again:
          </div>
          <div>{issued.token}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={styles.btnGhost} onClick={() => copy(issued.token)} type="button">
              Copy
            </button>
            <button style={styles.btnGhost} onClick={() => setIssued(null)} type="button">
              Dismiss
            </button>
          </div>
          <p style={styles.warn}>
            Store this securely. If you lose it, revoke it here and create a new one.
          </p>
        </div>
      )}

      {error && <p style={{ color: 'var(--accent)', fontSize: 12, marginTop: 8 }}>{error}</p>}

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <p style={styles.empty}>Loading…</p>
        ) : tokens.length === 0 ? (
          <p style={styles.empty}>No tokens yet.</p>
        ) : (
          <div style={styles.list}>
            {tokens.map((t) => (
              <div key={t.id} style={styles.row}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div style={styles.meta}>
                    <span style={styles.mono}>{t.prefix}…</span> · created {fmt(t.createdAt)} ·
                    last used {fmt(t.lastUsedAt)}
                  </div>
                </div>
                <button style={styles.btnGhost} onClick={() => onRevoke(t.id)} type="button">
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
