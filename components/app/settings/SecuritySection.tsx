'use client';

import { useEffect, useState, type CSSProperties } from 'react';

interface OidcLink {
  id: string;
  provider: string;
  subject: string;
  createdAt: string;
  lastLoginAt: string | null;
}

interface SecurityStatus {
  totp: { enabled: boolean; enrolled: boolean; enrolledAt: string | null };
  oidc: { enabled: boolean; label: string; accounts: OidcLink[] };
  proxyMode: boolean;
  hasPassword: boolean;
}

interface EnrollmentMaterial {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
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
  subhead: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--ink)',
    marginTop: 18,
    marginBottom: 8,
  },
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
  rowText: { flex: 1 },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--accent)',
    color: 'white',
    fontSize: 11,
    fontWeight: 600,
  },
  btn: {
    border: 0,
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    background: 'var(--accent)',
    color: 'white',
  },
  btnSecondary: {
    border: '1px solid var(--hair)',
    background: 'var(--surface-2)',
    color: 'var(--ink)',
  },
  btnDanger: {
    background: '#b04050',
    color: 'white',
  },
  input: {
    width: '100%',
    padding: '8px 11px',
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    fontSize: 14,
    color: 'var(--ink)',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
  },
  err: { color: 'var(--accent)', fontSize: 12, marginTop: 8 },
  qr: {
    background: 'white',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    padding: 12,
    width: 'max-content',
  },
  recovery: {
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    padding: 12,
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    lineHeight: 1.7,
    columnCount: 2,
  },
  meta: { color: 'var(--ink-3)', fontSize: 12 },
};

export function SecuritySection() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentMaterial | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [savedRecovery, setSavedRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      const res = await fetch('/api/auth/security/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SecurityStatus;
      setStatus(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function startEnrollment() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/totp/setup');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EnrollmentMaterial;
      setEnrollment(data);
      setEnrollCode('');
      setSavedRecovery(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment() {
    if (!enrollment) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/totp/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: enrollment.secret,
          code: enrollCode.trim(),
          recoveryCodes: enrollment.recoveryCodes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setEnrollment(null);
      setEnrollCode('');
      setSavedRecovery(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disableTotp() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableCode.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setDisableOpen(false);
      setDisableCode('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlinkOidc(linkId: string) {
    if (!confirm('Unlink this account?')) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/oidc-accounts/${encodeURIComponent(linkId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <section style={styles.section}>
        <h2 style={styles.h2}>Security</h2>
        {error && <p style={styles.err}>{error}</p>}
      </section>
    );
  }

  const showTotp = status.totp.enabled && status.hasPassword;
  const showOidc = status.oidc.enabled;

  if (!showTotp && !showOidc) return null;

  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>Security</h2>
      <p style={styles.help}>
        Two-factor authentication and any single sign-on accounts linked to this user.
      </p>

      {error && <p style={styles.err}>{error}</p>}

      {showTotp && (
        <>
          <div style={styles.subhead}>Two-factor authentication</div>
          {!status.totp.enrolled && !enrollment && (
            <div style={styles.row}>
              <div style={styles.rowText}>
                <div>Add a second factor to your password sign-in.</div>
                <div style={styles.meta}>
                  Use any TOTP app — Google Authenticator, 1Password, Aegis, Authy, etc.
                </div>
              </div>
              <button
                type="button"
                style={styles.btn}
                onClick={startEnrollment}
                disabled={busy}
              >
                {busy ? '…' : 'Set up 2FA'}
              </button>
            </div>
          )}

          {!status.totp.enrolled && enrollment && (
            <div style={{ ...styles.row, alignItems: 'flex-start', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>1. Scan this QR code</div>
                <div style={styles.qr}>
                  {/* QR is a fixed-size data URL — next/image optimization adds nothing. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={enrollment.qrCodeDataUrl} alt="TOTP QR code" width={220} height={220} />
                </div>
                <div style={styles.meta}>
                  Or enter the secret manually: <code>{enrollment.secret}</code>
                </div>
              </div>

              <div style={{ width: '100%' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  2. Save your recovery codes
                </div>
                <div style={styles.meta}>
                  Each code can be used once if you lose access to your authenticator. Store them
                  somewhere safe — they will not be shown again.
                </div>
                <div style={styles.recovery}>
                  {enrollment.recoveryCodes.map((c) => (
                    <div key={c}>{c}</div>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={savedRecovery}
                    onChange={(e) => setSavedRecovery(e.target.checked)}
                  />
                  <span style={{ fontSize: 13 }}>I have saved my recovery codes.</span>
                </label>
              </div>

              <div style={{ width: '100%' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  3. Enter the 6-digit code from your authenticator
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  style={styles.input}
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value)}
                  placeholder="000000"
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={styles.btn}
                  onClick={confirmEnrollment}
                  disabled={busy || !savedRecovery || enrollCode.trim().length < 6}
                >
                  {busy ? 'Enabling…' : 'Enable 2FA'}
                </button>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnSecondary }}
                  onClick={() => {
                    setEnrollment(null);
                    setEnrollCode('');
                    setSavedRecovery(false);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {status.totp.enrolled && (
            <div style={styles.row}>
              <div style={styles.rowText}>
                <div>
                  <span style={styles.badge}>Enrolled</span>{' '}
                  Two-factor authentication is on.
                </div>
                <div style={styles.meta}>
                  Enrolled{' '}
                  {status.totp.enrolledAt
                    ? new Date(status.totp.enrolledAt).toLocaleDateString()
                    : ''}
                </div>
              </div>
              {!disableOpen ? (
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnDanger }}
                  onClick={() => setDisableOpen(true)}
                  disabled={busy}
                >
                  Disable
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    style={{ ...styles.input, width: 160 }}
                    placeholder="Code or recovery"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      style={{ ...styles.btn, ...styles.btnDanger }}
                      onClick={disableTotp}
                      disabled={busy || !disableCode.trim()}
                    >
                      Confirm disable
                    </button>
                    <button
                      type="button"
                      style={{ ...styles.btn, ...styles.btnSecondary }}
                      onClick={() => {
                        setDisableOpen(false);
                        setDisableCode('');
                      }}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showOidc && (
        <>
          <div style={styles.subhead}>Single sign-on ({status.oidc.label})</div>
          {status.oidc.accounts.length === 0 ? (
            <div style={styles.row}>
              <div style={styles.rowText}>
                <div>No accounts linked.</div>
                <div style={styles.meta}>
                  Sign out and use the &quot;Sign in with {status.oidc.label}&quot; button on the
                  login page to link, if your operator has enabled email-based linking.
                </div>
              </div>
            </div>
          ) : (
            status.oidc.accounts.map((acc, i) => (
              <div key={acc.id} style={{ ...styles.row, marginTop: i ? 8 : 0 }}>
                <div style={styles.rowText}>
                  <div>
                    <code>{acc.subject}</code>
                  </div>
                  <div style={styles.meta}>
                    Linked {new Date(acc.createdAt).toLocaleDateString()}
                    {acc.lastLoginAt
                      ? ` · last sign-in ${new Date(acc.lastLoginAt).toLocaleDateString()}`
                      : ''}
                  </div>
                </div>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnSecondary }}
                  onClick={() => unlinkOidc(acc.id)}
                  disabled={busy}
                >
                  Unlink
                </button>
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}

