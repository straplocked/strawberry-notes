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
  gap: 16,
};

const heading: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  fontWeight: 600,
  margin: 0,
  letterSpacing: '-0.01em',
};

const body: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-2)',
  lineHeight: 1.55,
};

const warn: CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--accent)',
  borderRadius: 10,
  padding: 12,
  fontSize: 12.5,
  color: 'var(--ink-2)',
  lineHeight: 1.5,
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
  marginTop: 4,
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

type Step = 'intro' | 'passphrase' | 'generating' | 'recoveryShown' | 'done';

export interface PrivateNotesSetupModalProps {
  open: boolean;
  onClose: () => void;
}

export function PrivateNotesSetupModal({ open, onClose }: PrivateNotesSetupModalProps) {
  const isMobile = useIsMobile();
  const { setup, busy } = usePrivateNotesStore();
  const [step, setStep] = useState<Step>('intro');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset state on close so the next open is fresh.
      setTimeout(() => {
        setStep('intro');
        setPassphrase('');
        setConfirmPassphrase('');
        setRecoveryCode(null);
        setConfirmedSaved(false);
        setError(null);
      }, 200);
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

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
        width: 'min(480px, calc(100vw - 32px))',
        padding: 24,
      };

  const outer: CSSProperties = isMobile
    ? { ...backdrop, alignItems: 'flex-end' }
    : { ...backdrop, alignItems: 'center', justifyContent: 'center', padding: 16 };

  const goPassphrase = () => setStep('passphrase');

  const generate = async () => {
    setError(null);
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match.');
      return;
    }
    setStep('generating');
    try {
      const { recoveryCode: code } = await setup(passphrase);
      setRecoveryCode(code);
      setStep('recoveryShown');
    } catch (err) {
      setError((err as Error).message);
      setStep('passphrase');
    }
  };

  const finish = () => {
    setStep('done');
    onClose();
  };

  return createPortal(
    <div
      style={outer}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pn-setup-title"
      onClick={(e) => {
        // Backdrop click: only allowed if we're not in the middle of a critical step.
        if (e.target !== e.currentTarget) return;
        if (step === 'generating') return;
        // Prevent dismiss on the recoveryShown step — user must explicitly confirm.
        if (step === 'recoveryShown') return;
        onClose();
      }}
    >
      <div style={card}>
        {step === 'intro' && (
          <>
            <h3 id="pn-setup-title" style={heading}>
              Set up Private Notes
            </h3>
            <p style={body}>
              Private Notes encrypts a note&apos;s body in your browser before saving. The
              server cannot read it. MCP clients and the web clipper cannot see it.
            </p>
            <div style={warn}>
              <strong>Save your recovery code somewhere safe.</strong> If you forget your
              passphrase <em>and</em> lose your recovery code, your private notes are
              gone forever — the operator cannot recover them.
            </div>
            <div style={actionsRow}>
              <button type="button" style={btnGhost} onClick={onClose}>
                Cancel
              </button>
              <button type="button" style={btnPrimary} onClick={goPassphrase}>
                I understand — continue
              </button>
            </div>
          </>
        )}

        {step === 'passphrase' && (
          <>
            <h3 id="pn-setup-title" style={heading}>
              Choose a passphrase
            </h3>
            <p style={body}>
              Pick something you can remember. Minimum 8 characters; longer is stronger.
              You&apos;ll need it every time the app auto-locks.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="password"
                placeholder="Passphrase"
                style={input}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoFocus
                autoComplete="new-password"
              />
              <input
                type="password"
                placeholder="Confirm passphrase"
                style={input}
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') generate();
                }}
              />
            </div>
            {error && <p style={errStyle}>{error}</p>}
            <div style={actionsRow}>
              <button type="button" style={btnGhost} onClick={onClose}>
                Cancel
              </button>
              <button type="button" style={btnPrimary} onClick={generate} disabled={busy}>
                {busy ? 'Generating…' : 'Generate keys'}
              </button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <>
            <h3 style={heading}>Deriving keys…</h3>
            <p style={body}>
              Stretching your passphrase with PBKDF2-SHA256 (600 000 iterations). This
              takes about half a second on a modern laptop.
            </p>
          </>
        )}

        {step === 'recoveryShown' && recoveryCode && (
          <>
            <h3 id="pn-setup-title" style={heading}>
              Save your recovery code
            </h3>
            <p style={body}>
              This is the <strong>only time</strong> this code will be shown. If you forget
              your passphrase, this code is the only way to recover your private notes.
              Store it in a password manager or print it.
            </p>
            <div style={codeBox}>{recoveryCode}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                style={btnGhost}
                onClick={() => {
                  navigator.clipboard.writeText(recoveryCode).catch(() => {});
                }}
              >
                Copy
              </button>
            </div>
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
                onClick={finish}
                disabled={!confirmedSaved}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
