'use client';

import type { CSSProperties } from 'react';
import { useOfflineStatus } from '@/lib/pwa/use-offline-status';

const style: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 16,
  transform: 'translateX(-50%)',
  zIndex: 1000,
  background: 'var(--ink)',
  color: 'var(--surface)',
  padding: '8px 16px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.01em',
  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: 'calc(100vw - 32px)',
  textAlign: 'center',
};

const dot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#e3b23d',
  flexShrink: 0,
};

/** Visible whenever the app thinks it's offline — either the browser says
 * so, or a recent API call failed with a network-shaped error. No edit
 * queue (out of scope, tracked as B18): this just tells the user their
 * writes won't land until connectivity is back. */
export function OfflineBanner() {
  const offline = useOfflineStatus();
  if (!offline) return null;
  return (
    <div role="status" style={style}>
      <span aria-hidden style={dot} />
      Offline — showing saved notes, edits won&apos;t save
    </div>
  );
}
