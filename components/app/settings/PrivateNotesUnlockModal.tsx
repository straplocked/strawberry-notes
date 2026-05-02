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

const linkBtn: CSSProperties = {
  background: 'transparent',
  border: 0,
  color: 'var(--accent)',
  fontSize: 12,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
  alignSelf: 'flex-start',
};

const errStyle: CSSProperties = { color: 'var(--accent)', fontSize: 12 };

export interface PrivateNotesUnlockModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional callback fired after a successful unlock. */
  onUnlocked?: () => void;
}

export function PrivateNotesUnlockModal({
  open,
  onClose,
  onUnlocked,
}: PrivateNotesUnlockModalProps) {
  const isMobile = useIsMobile();
  const { unlockWithPassphrase, unlockWithRecoveryCode, busy } = usePrivateNotesStore();
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setMode('passphrase');
        setSecret('');
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
        width: 'min(420px, calc(100vw - 32px))',
        padding: 24,
      };

  const outer: CSSProperties = isMobile
    ? { ...backdrop, alignItems: 'flex-end' }
    : { ...backdrop, alignItems: 'center', justifyContent: 'center', padding: 16 };

  const onSubmit = async () => {
    if (!secret.trim()) return;
    setError(null);
    try {
      if (mode === 'passphrase') {
        await unlockWithPassphrase(secret);
      } else {
        await unlockWithRecoveryCode(secret);
      }
      setSecret('');
      onUnlocked?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return createPortal(
    <div
      style={outer}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pn-unlock-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={card}>
        <h3 id="pn-unlock-title" style={heading}>
          {mode === 'passphrase' ? 'Unlock Private Notes' : 'Unlock with recovery code'}
        </h3>
        <input
          type={mode === 'passphrase' ? 'password' : 'text'}
          placeholder={mode === 'passphrase' ? 'Passphrase' : 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          style={input}
          autoFocus
          autoComplete={mode === 'passphrase' ? 'current-password' : 'off'}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onSubmit();
          }}
        />
        {error && <p style={errStyle}>{error}</p>}
        <button
          type="button"
          style={linkBtn}
          onClick={() => {
            setMode(mode === 'passphrase' ? 'recovery' : 'passphrase');
            setSecret('');
            setError(null);
          }}
        >
          {mode === 'passphrase'
            ? 'Use recovery code instead'
            : 'Use passphrase instead'}
        </button>
        <div style={actionsRow}>
          <button type="button" style={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={btnPrimary}
            onClick={onSubmit}
            disabled={busy || !secret.trim()}
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
