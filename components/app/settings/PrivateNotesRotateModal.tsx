'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePrivateNotesStore } from '@/lib/store/private-notes-store';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';

const backdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  zIndex: 100,
};

const cardBase: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--hair)',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const heading: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  fontWeight: 600,
  margin: 0,
};

const body: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-2)',
  lineHeight: 1.55,
};

const input: CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--hair)',
  borderRadius: 8,
  padding: '10px 12px',
  color: 'var(--ink)',
  fontSize: 13.5,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const codeBox: CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
  fontSize: 16,
  letterSpacing: '0.05em',
  textAlign: 'center',
  padding: '14px 12px',
  background: 'var(--surface-2)',
  border: '1px solid var(--accent)',
  borderRadius: 10,
  wordBreak: 'break-all',
};

const actionsRow: CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
};

const btnPrimary: CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnGhost: CSSProperties = {
  background: 'transparent',
  color: 'var(--ink-3)',
  border: '1px solid var(--hair)',
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 13,
  cursor: 'pointer',
};

const errStyle: CSSProperties = { color: 'var(--accent)', fontSize: 12 };

export interface PrivateNotesRotateModalProps {
  /** `null` closes the modal; `'passphrase' | 'recovery'` opens in that mode. */
  mode: 'passphrase' | 'recovery' | null;
  onClose: () => void;
}

export function PrivateNotesRotateModal({ mode, onClose }: PrivateNotesRotateModalProps) {
  const isMobile = useIsMobile();
  const { changePassphrase, regenerateRecoveryCode, busy } = usePrivateNotesStore();
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === null) {
      setTimeout(() => {
        setCurrentPass('');
        setNewPass('');
        setConfirmNew('');
        setNewRecoveryCode(null);
        setConfirmedSaved(false);
        setError(null);
      }, 200);
    }
  }, [mode]);

  if (mode === null || typeof document === 'undefined') return null;

  const card: CSSProperties = isMobile
    ? {
        ...cardBase,
        alignSelf: 'flex-end',
        width: '100%',
        borderRadius: '14px 14px 0 0',
        borderBottom: 0,
        padding: '24px 20px calc(20px + env(safe-area-inset-bottom))',
      }
    : {
        ...cardBase,
        margin: 'auto',
        borderRadius: 12,
        width: 'min(440px, calc(100vw - 32px))',
        padding: 24,
      };

  const outer: CSSProperties = isMobile
    ? { ...backdrop, alignItems: 'flex-end' }
    : { ...backdrop, alignItems: 'center', justifyContent: 'center', padding: 16 };

  const submit = async () => {
    setError(null);
    if (!currentPass) {
      setError('Enter your current passphrase to continue.');
      return;
    }
    if (mode === 'passphrase') {
      if (newPass.length < 8) {
        setError('New passphrase must be at least 8 characters.');
        return;
      }
      if (newPass !== confirmNew) {
        setError('New passphrases do not match.');
        return;
      }
      try {
        await changePassphrase(currentPass, newPass);
        onClose();
      } catch (err) {
        setError((err as Error).message);
      }
    } else {
      try {
        const { recoveryCode } = await regenerateRecoveryCode(currentPass);
        setNewRecoveryCode(recoveryCode);
      } catch (err) {
        setError((err as Error).message);
      }
    }
  };

  return createPortal(
    <div
      style={outer}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        // Block backdrop dismiss while a new code is being shown.
        if (newRecoveryCode) return;
        onClose();
      }}
    >
      <div style={card}>
        {newRecoveryCode ? (
          <>
            <h3 style={heading}>Save your new recovery code</h3>
            <p style={body}>
              The previous recovery code no longer works. This is the only time the new
              one will be shown.
            </p>
            <div style={codeBox}>{newRecoveryCode}</div>
            <button
              type="button"
              style={btnGhost}
              onClick={() => navigator.clipboard.writeText(newRecoveryCode).catch(() => {})}
            >
              Copy
            </button>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--ink-2)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={confirmedSaved}
                onChange={(e) => setConfirmedSaved(e.target.checked)}
              />
              I have saved this recovery code somewhere safe.
            </label>
            <div style={actionsRow}>
              <button
                type="button"
                style={btnPrimary}
                onClick={onClose}
                disabled={!confirmedSaved}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 style={heading}>
              {mode === 'passphrase' ? 'Change passphrase' : 'Regenerate recovery code'}
            </h3>
            <p style={body}>
              Enter your current passphrase to confirm. Your private notes are not
              re-encrypted; only the wrap that protects the master key changes.
            </p>
            <input
              type="password"
              placeholder="Current passphrase"
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              style={input}
              autoFocus
              autoComplete="current-password"
            />
            {mode === 'passphrase' && (
              <>
                <input
                  type="password"
                  placeholder="New passphrase"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  style={input}
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  placeholder="Confirm new passphrase"
                  value={confirmNew}
                  onChange={(e) => setConfirmNew(e.target.value)}
                  style={input}
                  autoComplete="new-password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit();
                  }}
                />
              </>
            )}
            {error && <p style={errStyle}>{error}</p>}
            <div style={actionsRow}>
              <button type="button" style={btnGhost} onClick={onClose}>
                Cancel
              </button>
              <button type="button" style={btnPrimary} onClick={submit} disabled={busy}>
                {busy
                  ? 'Working…'
                  : mode === 'passphrase'
                    ? 'Change passphrase'
                    : 'Generate new code'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
