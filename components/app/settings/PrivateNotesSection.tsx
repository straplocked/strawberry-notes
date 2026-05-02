'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { usePrivateNotesStore } from '@/lib/store/private-notes-store';
import { PrivateNotesSetupModal } from './PrivateNotesSetupModal';
import { PrivateNotesUnlockModal } from './PrivateNotesUnlockModal';
import { PrivateNotesRotateModal } from './PrivateNotesRotateModal';

const styles: Record<string, CSSProperties> = {
  section: {
    background: 'var(--surface)',
    border: '1px solid var(--hair)',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
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
  banner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--hair)',
    background: 'var(--surface-2)',
    marginBottom: 16,
    fontSize: 13,
  },
  bannerStatus: { fontWeight: 600 },
  bannerMeta: { color: 'var(--ink-3)', fontSize: 12 },
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
  btnDanger: {
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
  rowSpaced: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  inputRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 },
  numInput: {
    width: 80,
    padding: '6px 10px',
    background: 'var(--surface-2)',
    border: '1px solid var(--hair)',
    borderRadius: 8,
    color: 'var(--ink)',
    fontSize: 13,
  },
  err: { color: 'var(--accent)', fontSize: 12, marginTop: 8 },
};

export function PrivateNotesSection() {
  const {
    status,
    busy,
    privateCount,
    autoLockMin,
    lastError,
    hydrate,
    lock,
    disable,
    setAutoLockMin,
  } = usePrivateNotesStore();
  const [setupOpen, setSetupOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [rotateMode, setRotateMode] = useState<'passphrase' | 'recovery' | null>(null);
  const [disablingError, setDisablingError] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const onDisable = async () => {
    setDisablingError(null);
    if (
      !window.confirm(
        'Disable Private Notes? This deletes the wrapping keys on the server. ' +
          'You must first migrate any private notes back to plaintext (one at a time, from the editor lock toggle).',
      )
    ) {
      return;
    }
    try {
      await disable();
    } catch (err) {
      setDisablingError((err as Error).message);
    }
  };

  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>Private Notes</h2>
      <p style={styles.help}>
        Encrypt a note&apos;s body so the server cannot read it. Locked notes are also{' '}
        <strong>invisible to MCP clients and the web clipper</strong> — useful when an
        agent has access to your workspace and you want some notes off-limits.
      </p>
      <p style={styles.help}>
        <strong>Important:</strong> if you forget your passphrase <em>and</em> lose your
        recovery code, your private notes cannot be recovered by anyone — not even the
        operator. The keys live only on your devices.
      </p>

      <div style={styles.banner}>
        <div>
          <div style={styles.bannerStatus}>
            {status === 'unconfigured'
              ? 'Not set up'
              : status === 'locked'
                ? '🔒 Locked'
                : '🔓 Unlocked'}
          </div>
          <div style={styles.bannerMeta}>
            {privateCount > 0
              ? `${privateCount} private note${privateCount === 1 ? '' : 's'}`
              : 'No private notes yet'}
          </div>
        </div>
        <div style={styles.rowSpaced}>
          {status === 'unconfigured' && (
            <button
              type="button"
              style={styles.btnPrimary}
              onClick={() => setSetupOpen(true)}
              disabled={busy}
            >
              Set up Private Notes
            </button>
          )}
          {status === 'locked' && (
            <button
              type="button"
              style={styles.btnPrimary}
              onClick={() => setUnlockOpen(true)}
              disabled={busy}
            >
              Unlock
            </button>
          )}
          {status === 'unlocked' && (
            <button
              type="button"
              style={styles.btnGhost}
              onClick={() => lock()}
              disabled={busy}
            >
              Lock now
            </button>
          )}
        </div>
      </div>

      {status !== 'unconfigured' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={styles.btnGhost}
            onClick={() => setRotateMode('passphrase')}
            disabled={busy}
          >
            Change passphrase
          </button>
          <button
            type="button"
            style={styles.btnGhost}
            onClick={() => setRotateMode('recovery')}
            disabled={busy}
          >
            Regenerate recovery code
          </button>
          <button
            type="button"
            style={styles.btnDanger}
            onClick={onDisable}
            disabled={busy}
          >
            Disable Private Notes
          </button>
        </div>
      )}

      <div style={styles.inputRow}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Auto-lock after</span>
        <input
          type="number"
          min={1}
          max={1440}
          value={autoLockMin}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setAutoLockMin(n);
          }}
          style={styles.numInput}
        />
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>minutes of inactivity</span>
      </div>

      {(lastError || disablingError) && (
        <p style={styles.err}>{disablingError ?? lastError}</p>
      )}

      <PrivateNotesSetupModal open={setupOpen} onClose={() => setSetupOpen(false)} />
      <PrivateNotesUnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} />
      <PrivateNotesRotateModal
        mode={rotateMode}
        onClose={() => setRotateMode(null)}
      />
    </section>
  );
}
