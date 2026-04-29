'use client';

import { useEffect, useState, type CSSProperties } from 'react';

const EVENTS = [
  'note.created',
  'note.updated',
  'note.trashed',
  'note.tagged',
  'note.linked',
] as const;
type Event = (typeof EVENTS)[number];

interface WebhookDTO {
  id: string;
  name: string;
  url: string;
  events: Event[];
  enabled: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  createdAt: string;
}

interface IssuedWebhook extends WebhookDTO {
  secret: string;
}

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
  form: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 },
  formRow: { display: 'flex', gap: 8 },
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
  eventRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  eventChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 999,
    fontSize: 12,
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  eventChipOn: {
    background: 'var(--accent-soft, var(--accent))',
    borderColor: 'var(--accent)',
    color: 'var(--accent-ink)',
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
    alignSelf: 'flex-start' as const,
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
    padding: '12px 14px',
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    fontSize: 13,
  },
  rowHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rowName: { fontWeight: 600 },
  rowMeta: { color: 'var(--ink-3)', fontSize: 11, marginTop: 4 },
  rowActions: { display: 'flex', gap: 8 },
  status: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: 999,
    marginRight: 6,
    verticalAlign: 'middle',
  },
  empty: { color: 'var(--ink-4)', fontSize: 13, fontStyle: 'italic', padding: '16px 0' },
  secretBox: {
    marginTop: 16,
    padding: 14,
    background: 'var(--surface-2)',
    border: '1px solid var(--accent)',
    borderRadius: 10,
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
    fontSize: 12,
    wordBreak: 'break-all' as const,
  },
  warn: { marginTop: 8, color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.5 },
  err: { color: 'var(--accent)', fontSize: 12, marginTop: 8 },
  errSmall: { color: 'var(--accent)', fontSize: 11, marginTop: 4 },
};

function fmt(iso: string | null) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString();
}

function statusColor(w: WebhookDTO): string {
  if (!w.enabled) return 'var(--accent)';
  if (w.consecutiveFailures > 0) return '#d97706';
  if (w.lastSuccessAt) return '#16a34a';
  return 'var(--ink-4)';
}

function statusLabel(w: WebhookDTO): string {
  if (!w.enabled) return 'disabled';
  if (w.consecutiveFailures > 0) return `${w.consecutiveFailures} consecutive failure${w.consecutiveFailures === 1 ? '' : 's'}`;
  if (w.lastSuccessAt) return 'healthy';
  return 'no deliveries yet';
}

export function WebhooksSection() {
  const [list, setList] = useState<WebhookDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<Set<Event>>(new Set(EVENTS));
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<IssuedWebhook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const refresh = () => setReloadTick((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/webhooks', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WebhookDTO[];
        if (!cancelled) setList(data);
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
    if (!name.trim() || !url.trim() || events.size === 0) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          events: Array.from(events),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as IssuedWebhook;
      setIssued(data);
      setName('');
      setUrl('');
      setEvents(new Set(EVENTS));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this webhook? Pending deliveries will be dropped.')) return;
    const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
    if (res.ok) refresh();
  };

  const onTest = async (id: string) => {
    const res = await fetch(`/api/webhooks/${id}/test`, { method: 'POST' });
    const body = (await res.json().catch(() => ({}))) as {
      ok: boolean;
      status?: number | null;
      errorMessage?: string;
    };
    if (body.ok) {
      window.alert(`Test delivered (${body.status ?? '2xx'}).`);
    } else {
      window.alert(`Test failed: ${body.errorMessage ?? `HTTP ${body.status ?? '?'}`}`);
    }
    refresh();
  };

  const onToggleEnabled = async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/webhooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, resetFailures: enabled }),
    });
    if (res.ok) refresh();
  };

  const toggleEvent = (e: Event) => {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });
  };

  const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => {});

  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>Webhooks</h2>
      <p style={styles.help}>
        Get an HTTPS POST when a note is created, updated, trashed, tagged, or linked. Each
        delivery is signed (<code>X-Strawberry-Signature: sha256=…</code>) and retried with
        exponential backoff. Five consecutive failures auto-disable the webhook.
      </p>

      <form onSubmit={onCreate} style={styles.form}>
        <div style={styles.formRow}>
          <input
            style={styles.input}
            placeholder="Name (e.g. n8n / Zapier / Slack)"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            maxLength={80}
          />
        </div>
        <div style={styles.formRow}>
          <input
            style={styles.input}
            placeholder="https://your-endpoint.example.com/strawberry"
            value={url}
            onChange={(ev) => setUrl(ev.target.value)}
            maxLength={2000}
          />
        </div>
        <div style={styles.eventRow}>
          {EVENTS.map((e) => {
            const on = events.has(e);
            return (
              <span
                key={e}
                style={on ? { ...styles.eventChip, ...styles.eventChipOn } : styles.eventChip}
                onClick={() => toggleEvent(e)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    toggleEvent(e);
                  }
                }}
              >
                {on ? '✓ ' : ''}
                {e}
              </span>
            );
          })}
        </div>
        <button
          type="submit"
          style={styles.btnPrimary}
          disabled={creating || !name.trim() || !url.trim() || events.size === 0}
        >
          {creating ? 'Creating…' : 'Add webhook'}
        </button>
      </form>

      {issued && (
        <div style={styles.secretBox}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontFamily: 'var(--font-body)' }}>
            {issued.name} — copy this signing secret now, it won’t be shown again:
          </div>
          <div>{issued.secret}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={styles.btnGhost} onClick={() => copy(issued.secret)} type="button">
              Copy
            </button>
            <button style={styles.btnGhost} onClick={() => setIssued(null)} type="button">
              Dismiss
            </button>
          </div>
          <p style={styles.warn}>
            Verify each delivery on your end with <code>HMAC-SHA-256(secret, body)</code> and
            compare against the <code>X-Strawberry-Signature</code> header (strip the{' '}
            <code>sha256=</code> prefix).
          </p>
        </div>
      )}

      {error && <p style={styles.err}>{error}</p>}

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <p style={styles.empty}>Loading…</p>
        ) : list.length === 0 ? (
          <p style={styles.empty}>No webhooks yet.</p>
        ) : (
          <div style={styles.list}>
            {list.map((w) => (
              <div key={w.id} style={styles.row}>
                <div style={styles.rowHead}>
                  <div>
                    <div style={styles.rowName}>
                      <span
                        style={{ ...styles.status, background: statusColor(w) }}
                        title={statusLabel(w)}
                      />
                      {w.name}
                    </div>
                    <div style={styles.rowMeta}>
                      {w.url} · {w.events.join(', ')}
                    </div>
                    <div style={styles.rowMeta}>
                      created {fmt(w.createdAt)} · last success {fmt(w.lastSuccessAt)} · last
                      failure {fmt(w.lastFailureAt)}
                    </div>
                    {w.lastErrorMessage && <div style={styles.errSmall}>{w.lastErrorMessage}</div>}
                  </div>
                  <div style={styles.rowActions}>
                    <button style={styles.btnGhost} onClick={() => onTest(w.id)} type="button">
                      Test
                    </button>
                    <button
                      style={styles.btnGhost}
                      onClick={() => onToggleEnabled(w.id, !w.enabled)}
                      type="button"
                    >
                      {w.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button style={styles.btnGhost} onClick={() => onDelete(w.id)} type="button">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
