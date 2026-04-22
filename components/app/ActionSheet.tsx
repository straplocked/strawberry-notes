'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';

export interface ActionSheetAction {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}

export interface ActionSheetProps {
  open: boolean;
  title?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  zIndex: 100,
};

const titleStyle: CSSProperties = {
  padding: '12px 16px',
  fontSize: 11.5,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 600,
  color: 'var(--ink-3)',
  borderBottom: '1px solid var(--hair)',
};

function rowStyle(destructive: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '14px 16px',
    minHeight: 48,
    background: 'transparent',
    border: 0,
    borderBottom: '1px solid var(--hair)',
    color: destructive ? 'var(--berry)' : 'var(--ink)',
    fontSize: 15,
    fontWeight: 500,
    textAlign: 'left',
    cursor: 'pointer',
  };
}

export function ActionSheet({ open, title, actions, onClose }: ActionSheetProps) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const sheetStyle: CSSProperties = isMobile
    ? {
        alignSelf: 'flex-end',
        width: '100%',
        background: 'var(--surface)',
        color: 'var(--ink)',
        borderTop: '1px solid var(--hair)',
        borderRadius: '14px 14px 0 0',
        paddingBottom: 'env(safe-area-inset-bottom)',
        maxHeight: '70dvh',
        overflowY: 'auto',
        boxShadow: '0 -20px 40px rgba(0, 0, 0, 0.2)',
      }
    : {
        margin: 'auto',
        width: 'min(320px, calc(100vw - 32px))',
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1px solid var(--hair)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={sheetStyle}>
        {title && <div style={titleStyle}>{title}</div>}
        {actions.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              a.onSelect();
            }}
            style={{
              ...rowStyle(!!a.destructive),
              borderBottom: i === actions.length - 1 ? 0 : '1px solid var(--hair)',
            }}
          >
            {a.icon && <span style={{ display: 'inline-flex', color: 'var(--ink-3)' }}>{a.icon}</span>}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
