'use client';

import { useEffect, useState, type CSSProperties } from 'react';

interface EmailPreferences {
  passwordChanged: boolean;
  tokenCreated: boolean;
  webhookCreated: boolean;
  webhookDeadLetter: boolean;
}

const ITEMS: Array<{ key: keyof EmailPreferences; label: string; help: string }> = [
  {
    key: 'passwordChanged',
    label: 'Password changed',
    help: 'Email me whenever my password is updated — by me, by a self-service reset, or by an operator.',
  },
  {
    key: 'tokenCreated',
    label: 'New personal access token',
    help: 'Email me when a new token is minted on my account so I can spot ones I didn’t create.',
  },
  {
    key: 'webhookCreated',
    label: 'New webhook',
    help: 'Email me when a new outbound webhook is added — same reason as tokens.',
  },
  {
    key: 'webhookDeadLetter',
    label: 'Webhook auto-disabled',
    help: 'Email me when one of my webhooks is disabled after 5 consecutive delivery failures.',
  },
];

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
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '12px 14px',
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    fontSize: 13,
  },
  rowText: { flex: 1 },
  label: { fontWeight: 600, marginBottom: 2 },
  meta: { color: 'var(--ink-3)', fontSize: 12 },
  toggle: {
    appearance: 'none' as const,
    width: 36,
    height: 20,
    borderRadius: 999,
    background: 'var(--hair)',
    position: 'relative' as const,
    cursor: 'pointer',
    transition: 'background 120ms ease',
    flexShrink: 0,
    marginTop: 4,
  },
  notice: {
    color: 'var(--ink-3)',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 12,
  },
  err: { color: 'var(--accent)', fontSize: 12, marginTop: 8 },
};

export function EmailPreferencesSection() {
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<keyof EmailPreferences | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/email-preferences', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as EmailPreferences;
        if (!cancelled) setPrefs(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof EmailPreferences) {
    if (!prefs) return;
    const nextValue = !prefs[key];
    setSaving(key);
    setPrefs({ ...prefs, [key]: nextValue });
    try {
      const res = await fetch('/api/email-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: nextValue }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as EmailPreferences;
      setPrefs(updated);
    } catch (e) {
      setError((e as Error).message);
      // Revert optimistic flip on failure.
      setPrefs((p) => (p ? { ...p, [key]: !nextValue } : p));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>Email notifications</h2>
      <p style={styles.help}>
        We send a transactional email when something security-relevant happens on your account.
        Each one is on by default — turn them off here if you find them noisy. Requires SMTP to
        be configured by the operator; see the <code>SMTP_*</code> env vars.
      </p>

      {error && <p style={styles.err}>{error}</p>}

      <div style={styles.list}>
        {ITEMS.map(({ key, label, help }) => {
          const enabled = prefs?.[key] ?? true;
          const isSaving = saving === key;
          return (
            <div key={key} style={styles.row}>
              <div style={styles.rowText}>
                <div style={styles.label}>{label}</div>
                <div style={styles.meta}>{help}</div>
              </div>
              <button
                type="button"
                onClick={() => !isSaving && toggle(key)}
                disabled={!prefs || isSaving}
                aria-pressed={enabled}
                aria-label={`Toggle ${label}`}
                style={{
                  ...styles.toggle,
                  background: enabled ? 'var(--accent)' : 'var(--hair)',
                  opacity: !prefs || isSaving ? 0.6 : 1,
                  cursor: !prefs || isSaving ? 'wait' : 'pointer',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: enabled ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    background: 'white',
                    transition: 'left 120ms ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>

      <p style={styles.notice}>
        Note: signup-confirmation emails are an instance-level setting (the operator’s{' '}
        <code>REQUIRE_EMAIL_CONFIRMATION</code> env). They’re not toggleable here.
      </p>
    </section>
  );
}
