/**
 * Small external store tracking whether the app should show its "offline"
 * indicator: the browser reports no connectivity (navigator.onLine), a
 * recent API call failed with what looks like a network error, or (the
 * common real-world case for a self-hosted app: the server/container is
 * down but the network interface is fine) the service worker told us this
 * page load was served from its offline cache fallback.
 *
 * lib/api/client.ts reports every request's outcome through
 * reportNetworkFailure/reportNetworkSuccess; offline-fallback-marker.ts
 * reports the SW signal through reportOfflineFallbackServed(); components
 * read the combined state through useOfflineStatus()
 * (lib/pwa/use-offline-status.ts).
 *
 * No edit queue here (out of scope, tracked separately) — this only drives
 * the visible "showing saved notes, edits won't save" banner.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let browserOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
let recentNetworkFailure = false;
// Separate from recentNetworkFailure on purpose: once the SW has told us
// this page load was served from its offline fallback, a *later*
// successful-looking fetch() is not trustworthy proof of real
// connectivity — it may just be the SW serving another cached response
// (see public/sw.js's networkFirstData). reportNetworkSuccess() must not
// clear this; only an actual browser 'online' event (or a fresh page load
// that isn't itself marked offline) does.
let swConfirmedOffline = false;

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getOfflineSnapshot(): boolean {
  return browserOffline || recentNetworkFailure || swConfirmedOffline;
}

export function getServerSnapshot(): boolean {
  return false;
}

export function subscribeOffline(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True for fetch()-level network failures (offline, DNS, connection
 * refused/reset) — as opposed to a normal HTTP error response (4xx/5xx),
 * which fetch() resolves rather than rejects. */
export function isLikelyNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = String((err as { message: unknown }).message);
    return /failed to fetch|network|load failed|ECONNREFUSED|ERR_INTERNET/i.test(message);
  }
  return false;
}

export function reportNetworkFailure(err: unknown): void {
  if (!isLikelyNetworkError(err)) return;
  if (!recentNetworkFailure) {
    recentNetworkFailure = true;
    emit();
  }
}

/** Authoritative version of reportNetworkFailure() for when the *service
 * worker* (not a guess based on a caught error) tells us the current page
 * came from its offline cache fallback — see
 * lib/pwa/offline-fallback-marker.ts. No isLikelyNetworkError() filtering
 * needed here: the SW only stamps this when it actually served a cached
 * fallback after a real fetch failure. */
export function reportOfflineFallbackServed(): void {
  if (!swConfirmedOffline) {
    swConfirmedOffline = true;
    emit();
  }
}

export function reportNetworkSuccess(): void {
  if (recentNetworkFailure) {
    recentNetworkFailure = false;
    emit();
  }
  // Deliberately does NOT clear swConfirmedOffline — see the comment on
  // that variable above.
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    browserOffline = false;
    recentNetworkFailure = false;
    swConfirmedOffline = false;
    emit();
  });
  window.addEventListener('offline', () => {
    browserOffline = true;
    emit();
  });
}
