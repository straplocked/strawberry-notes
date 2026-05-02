'use client';

import { useEffect, useState, type CSSProperties } from 'react';

interface AdminUserRow {
  id: string;
  email: string;
  role: 'user' | 'admin';
  disabledAt: string | null;
  emailConfirmedAt: string | null;
  totpEnrolledAt: string | null;
  createdAt: string;
}

interface NewUserResult {
  email: string;
  password: string | null;
}

const styles: Record<string, CSSProperties> = {
  section: {
    background: 'var(--surface)',
    border: '1px solid var(--hair)',
    borderRadius: 12,
    padding: 24,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  btnPrimary: {
    background: 'var(--berry)',
    color: 'var(--berry-ink)',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnGhost: {
    background: 'transparent',
    color: 'var(--ink-2)',
    border: '1px solid var(--hair)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  btnDanger: {
    background: 'transparent',
    color: 'var(--berry)',
    border: '1px solid var(--berry)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  },
  th: {
    textAlign: 'left' as const,
    color: 'var(--ink-3)',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    fontWeight: 600,
    padding: '8px 8px 12px',
    borderBottom: '1px solid var(--hair)',
  },
  td: {
    padding: '12px 8px',
    borderBottom: '1px solid var(--hair)',
    verticalAlign: 'middle' as const,
  },
  pill: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  actions: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, justifyContent: 'flex-end' as const },
  empty: { color: 'var(--ink-3)', fontSize: 13, padding: '24px 0', textAlign: 'center' as const },
  err: {
    background: 'rgba(227, 61, 78, 0.1)',
    border: '1px solid var(--berry)',
    color: 'var(--berry)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 12,
    marginBottom: 12,
  },
  modalBackdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: 16,
  },
  modal: {
    background: 'var(--surface)',
    border: '1px solid var(--hair)',
    borderRadius: 12,
    padding: 24,
    width: 'min(420px, 100%)',
    boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
  },
  modalH: {
    fontFamily: 'var(--font-display)',
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
    marginBottom: 12,
  },
  label: {
    display: 'block',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--ink-3)',
    marginBottom: 6,
    fontWeight: 600,
  },
  input: {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--ink)',
    fontSize: 13,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  pwBox: {
    marginTop: 16,
    padding: 12,
    background: 'var(--surface-2)',
    border: '1px solid var(--berry)',
    borderRadius: 8,
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: 13,
    wordBreak: 'break-all' as const,
  },
};

function pillStyle(kind: 'admin' | 'disabled' | 'unconfirmed' | 'active'): CSSProperties {
  const map = {
    admin: { background: 'var(--berry-soft)', color: 'var(--berry-ink)' },
    disabled: { background: 'rgba(227, 61, 78, 0.15)', color: 'var(--berry)' },
    unconfirmed: { background: 'rgba(160,160,160,0.15)', color: 'var(--ink-3)' },
    active: { background: 'rgba(95, 174, 106, 0.15)', color: 'var(--leaf, #5fae6a)' },
  };
  return { ...styles.pill, ...map[kind] };
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof body.message === 'string' ? body.message : (body.error as string) ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function AdminUsersClient({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newResult, setNewResult] = useState<NewUserResult | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const refresh = () => setReloadTick((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<AdminUserRow[]>('/api/admin/users');
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const action = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onPromote = (u: AdminUserRow) =>
    action(u.id, () =>
      api(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: u.role === 'admin' ? 'user' : 'admin' }),
      }),
    );

  const onToggleDisabled = (u: AdminUserRow) =>
    action(u.id, () =>
      api(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ disabled: !u.disabledAt }),
      }),
    );

  const onResetPassword = (u: AdminUserRow) =>
    action(u.id, async () => {
      const res = await api<{ password: string }>(`/api/admin/users/${u.id}/reset-password`, {
        method: 'POST',
      });
      setNewResult({ email: u.email, password: res.password });
    });

  const onResetTotp = (u: AdminUserRow) => {
    if (!window.confirm(`Clear 2FA enrollment for ${u.email}?`)) return;
    void action(u.id, () =>
      api(`/api/admin/users/${u.id}/reset-totp`, { method: 'POST' }),
    );
  };

  const onDelete = (u: AdminUserRow) => {
    if (!window.confirm(`Delete ${u.email}? This removes all their notes too. Cannot be undone.`)) {
      return;
    }
    void action(u.id, () => api(`/api/admin/users/${u.id}`, { method: 'DELETE' }));
  };

  const onCreate = async (email: string, password: string | null) => {
    setError(null);
    try {
      const result = await api<{ email: string; password: string | null }>('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(password ? { email, password } : { email }),
      });
      setShowNew(false);
      if (result.password) {
        setNewResult({ email: result.email, password: result.password });
      }
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section style={styles.section}>
      {error && <div style={styles.err}>{error}</div>}
      <div style={styles.toolbar}>
        <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
          {rows ? `${rows.length} user${rows.length === 1 ? '' : 's'}` : 'Loading…'}
        </div>
        <button style={styles.btnPrimary} onClick={() => setShowNew(true)} type="button">
          + New user
        </button>
      </div>

      {rows && rows.length === 0 && <div style={styles.empty}>No users yet.</div>}

      {rows && rows.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>2FA</th>
              <th style={styles.th}>Created</th>
              <th style={{ ...styles.th, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isSelf = u.id === currentUserId;
              const status = u.disabledAt
                ? ('disabled' as const)
                : !u.emailConfirmedAt
                  ? ('unconfirmed' as const)
                  : ('active' as const);
              return (
                <tr key={u.id}>
                  <td style={styles.td}>
                    {u.email}
                    {isSelf && <span style={{ color: 'var(--ink-3)', marginLeft: 6 }}>(you)</span>}
                  </td>
                  <td style={styles.td}>
                    {u.role === 'admin' ? (
                      <span style={pillStyle('admin')}>Admin</span>
                    ) : (
                      <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>User</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={pillStyle(status)}>{status}</span>
                  </td>
                  <td style={{ ...styles.td, color: 'var(--ink-3)', fontSize: 12 }}>
                    {u.totpEnrolledAt ? (
                      <span style={pillStyle('active')}>enrolled</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ ...styles.td, color: 'var(--ink-3)', fontSize: 12 }}>
                    {fmt(u.createdAt)}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button
                        style={styles.btnGhost}
                        onClick={() => onResetPassword(u)}
                        disabled={busy === u.id}
                        type="button"
                      >
                        Reset pw
                      </button>
                      {u.totpEnrolledAt && (
                        <button
                          style={styles.btnGhost}
                          onClick={() => onResetTotp(u)}
                          disabled={busy === u.id}
                          type="button"
                          title="Clear the user's 2FA enrollment"
                        >
                          Reset 2FA
                        </button>
                      )}
                      <button
                        style={styles.btnGhost}
                        onClick={() => onPromote(u)}
                        disabled={busy === u.id || isSelf}
                        type="button"
                        title={isSelf ? "Can't change your own role" : ''}
                      >
                        {u.role === 'admin' ? 'Demote' : 'Promote'}
                      </button>
                      <button
                        style={styles.btnGhost}
                        onClick={() => onToggleDisabled(u)}
                        disabled={busy === u.id || isSelf}
                        type="button"
                        title={isSelf ? "Can't disable yourself" : ''}
                      >
                        {u.disabledAt ? 'Enable' : 'Disable'}
                      </button>
                      <button
                        style={styles.btnDanger}
                        onClick={() => onDelete(u)}
                        disabled={busy === u.id || isSelf}
                        type="button"
                        title={isSelf ? "Can't delete yourself" : ''}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showNew && <NewUserDialog onClose={() => setShowNew(false)} onCreate={onCreate} />}
      {newResult && (
        <PasswordRevealDialog result={newResult} onClose={() => setNewResult(null)} />
      )}
    </section>
  );
}

function NewUserDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (email: string, password: string | null) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [generate, setGenerate] = useState(true);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      await onCreate(email.trim(), generate ? null : password);
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={styles.modalBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <h2 style={styles.modalH}>New user</h2>
        <form onSubmit={submit}>
          <label style={styles.label} htmlFor="new-user-email">Email</label>
          <input
            id="new-user-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13 }}
          >
            <input
              type="checkbox"
              checked={generate}
              onChange={(e) => setGenerate(e.target.checked)}
            />
            Generate a random password
          </label>
          {!generate && (
            <div style={{ marginTop: 12 }}>
              <label style={styles.label} htmlFor="new-user-pw">Password (8+ chars)</label>
              <input
                id="new-user-pw"
                type="text"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
              />
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <button style={styles.btnGhost} type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              style={styles.btnPrimary}
              type="submit"
              disabled={pending || !email.trim() || (!generate && password.length < 8)}
            >
              {pending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordRevealDialog({
  result,
  onClose,
}: {
  result: NewUserResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!result.password) return;
    try {
      await navigator.clipboard.writeText(result.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div style={styles.modalBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <h2 style={styles.modalH}>One-time password</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>
          For <strong style={{ color: 'var(--ink)' }}>{result.email}</strong>. This will not be
          shown again — copy it now and share it out-of-band. The user should rotate it on first
          sign-in.
        </p>
        <div style={styles.pwBox}>{result.password}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button style={styles.btnGhost} type="button" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button style={styles.btnPrimary} type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
