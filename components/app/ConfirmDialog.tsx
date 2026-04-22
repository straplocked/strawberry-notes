'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  zIndex: 100,
};

const cardBaseStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--hair)',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const titleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.01em',
};

const messageStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-2)',
  lineHeight: 1.5,
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 4,
  justifyContent: 'flex-end',
};

function btnStyle(variant: 'cancel' | 'confirm', destructive: boolean): CSSProperties {
  const base: CSSProperties = {
    padding: '10px 16px',
    minHeight: 40,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid var(--hair)',
  };
  if (variant === 'cancel') {
    return {
      ...base,
      background: 'var(--surface-2)',
      color: 'var(--ink-2)',
    };
  }
  return {
    ...base,
    background: destructive ? 'var(--berry)' : 'var(--ink)',
    color: destructive ? 'white' : 'var(--surface)',
    borderColor: 'transparent',
  };
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isMobile = useIsMobile();
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, onCancel, onConfirm]);

  if (!open || typeof document === 'undefined') return null;

  const cardStyle: CSSProperties = isMobile
    ? {
        ...cardBaseStyle,
        alignSelf: 'flex-end',
        width: '100%',
        borderRadius: '14px 14px 0 0',
        borderBottom: 0,
        padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
      }
    : {
        ...cardBaseStyle,
        margin: 'auto',
        borderRadius: 12,
        width: 'min(420px, calc(100vw - 32px))',
        padding: 20,
      };

  const outerStyle: CSSProperties = isMobile
    ? { ...backdropStyle, alignItems: 'flex-end' }
    : { ...backdropStyle, alignItems: 'center', justifyContent: 'center', padding: 16 };

  return createPortal(
    <div
      style={outerStyle}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div style={cardStyle}>
        <div style={titleStyle}>{title}</div>
        <div style={messageStyle}>{message}</div>
        <div style={actionsStyle}>
          <button type="button" style={btnStyle('cancel', false)} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            style={btnStyle('confirm', destructive)}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
