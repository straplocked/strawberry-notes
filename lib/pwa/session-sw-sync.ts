/**
 * Tells the active service worker who's signed in, so it can notice a
 * *different* user signing in on the same device (shared device, no
 * explicit sign-out ever happened) and wipe cached notes accordingly. See
 * public/sw.js's 'message' handler / handleSessionUser().
 */
export function postSessionToServiceWorker(userId: string | null | undefined): void {
  if (!userId) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (!controller) return;
  try {
    controller.postMessage({ type: 'SN_SESSION', userId });
  } catch {
    // Best-effort — a stale/broken controller must never break the app.
  }
}
