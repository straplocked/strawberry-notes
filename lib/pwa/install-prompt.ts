/**
 * Captures the browser's `beforeinstallprompt` event so the app can show
 * its own "Install app" affordance (in Settings) instead of relying on the
 * browser's own UI, which many users never notice. Import this module for
 * its side effect (registering the listener) as early as possible — the
 * event only fires once and isn't replayable, so registering late can miss
 * it. See components/app/Providers.tsx.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let deferredEvent: BeforeInstallPromptEvent | null = null;
let installed = false;

function emit(): void {
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredEvent = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredEvent = null;
    emit();
  });
}

export interface InstallSnapshot {
  /** true once the browser has handed us a deferred prompt we can trigger. */
  canPrompt: boolean;
  installed: boolean;
}

export function getInstallSnapshot(): InstallSnapshot {
  return { canPrompt: deferredEvent !== null, installed };
}

export function getServerInstallSnapshot(): InstallSnapshot {
  return { canPrompt: false, installed: false };
}

export function subscribeInstall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredEvent) return 'unavailable';
  const event = deferredEvent;
  deferredEvent = null;
  emit();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}

/** Already running as an installed app (standalone display mode) — no
 * point offering to install again. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone);
}

/** iOS/iPadOS Safari never fires beforeinstallprompt — the only install
 * path is the manual Share → Add to Home Screen flow, so the UI shows a
 * one-line hint instead of an Install button there. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

const DISMISS_KEY = 'sn-install-dismissed';

/** Never-changing-while-mounted, no subscription needed — these exist so
 * the values can be read through useSyncExternalStore (see
 * lib/hooks/use-is-mobile.ts for the same pattern), which is the SSR-safe
 * way to read browser-only state without a setState-in-effect flash or a
 * hydration mismatch. A no-op subscribe is intentional: none of these
 * inputs change during a session. */
export function subscribeStatic(): () => void {
  return () => {};
}

export function getDismissedSnapshot(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
export function getServerDismissedSnapshot(): boolean {
  // Hide until we've confirmed (client-side) it wasn't dismissed, rather
  // than briefly flashing it for everyone during hydration.
  return true;
}

export function getStandaloneSnapshot(): boolean {
  return isStandalone();
}
export function getServerStandaloneSnapshot(): boolean {
  return true;
}

export function getIOSSnapshot(): boolean {
  return isIOS();
}
export function getServerIOSSnapshot(): boolean {
  return false;
}

export function markInstallDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Best-effort — private browsing / storage disabled.
  }
}
