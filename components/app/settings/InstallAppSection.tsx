'use client';

import { useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
  getDismissedSnapshot,
  getInstallSnapshot,
  getIOSSnapshot,
  getServerDismissedSnapshot,
  getServerInstallSnapshot,
  getServerIOSSnapshot,
  getServerStandaloneSnapshot,
  getStandaloneSnapshot,
  markInstallDismissed,
  promptInstall,
  subscribeInstall,
  subscribeStatic,
} from '@/lib/pwa/install-prompt';

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
    marginBottom: 16,
  },
  row: {
    display: 'flex',
    gap: 8,
  },
  primary: {
    appearance: 'none',
    border: 'none',
    background: 'var(--berry)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
  },
  secondary: {
    appearance: 'none',
    border: '1px solid var(--hair)',
    background: 'transparent',
    color: 'var(--ink-2)',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
  },
};

/** Dismissible "Install app" affordance. Hidden once already running
 * standalone, or once the user has dismissed it (remembered in
 * localStorage — this is a one-time hint, not a nag). On iOS, which never
 * fires beforeinstallprompt, shows a one-line Share → Add to Home Screen
 * hint instead of a button we can't actually trigger. */
export function InstallAppSection() {
  const { canPrompt, installed } = useSyncExternalStore(
    subscribeInstall,
    getInstallSnapshot,
    getServerInstallSnapshot,
  );
  // Read through useSyncExternalStore (not useState+useEffect) so the
  // browser-only checks (localStorage, display-mode, user agent) don't
  // flash the section during hydration or trip the
  // no-setState-in-effect lint rule — see lib/hooks/use-is-mobile.ts for
  // the same pattern. Server snapshot is the safe "hide it" default.
  const storedDismissed = useSyncExternalStore(
    subscribeStatic,
    getDismissedSnapshot,
    getServerDismissedSnapshot,
  );
  const standalone = useSyncExternalStore(
    subscribeStatic,
    getStandaloneSnapshot,
    getServerStandaloneSnapshot,
  );
  const ios = useSyncExternalStore(subscribeStatic, getIOSSnapshot, getServerIOSSnapshot);
  // Dismissing is a same-session, in-component action — no need to route
  // it back through the external store, just OR it in locally.
  const [justDismissed, setJustDismissed] = useState(false);
  const dismissed = storedDismissed || justDismissed;

  function dismiss() {
    markInstallDismissed();
    setJustDismissed(true);
  }

  if (standalone || installed || dismissed) return null;
  if (!canPrompt && !ios) return null;

  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>Install app</h2>
      {canPrompt ? (
        <>
          <p style={styles.help}>
            Install Strawberry Notes on this device for a full-screen app icon and offline note
            reading.
          </p>
          <div style={styles.row}>
            <button
              type="button"
              style={styles.primary}
              onClick={async () => {
                const outcome = await promptInstall();
                if (outcome !== 'unavailable') dismiss();
              }}
            >
              Install
            </button>
            <button type="button" style={styles.secondary} onClick={dismiss}>
              Not now
            </button>
          </div>
        </>
      ) : (
        <div style={styles.row}>
          <p style={{ ...styles.help, marginBottom: 0, flex: 1 }}>
            On iOS: tap Share, then &ldquo;Add to Home Screen&rdquo; to install.
          </p>
          <button type="button" style={styles.secondary} onClick={dismiss}>
            Got it
          </button>
        </div>
      )}
    </section>
  );
}
