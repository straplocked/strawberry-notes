import { DATA_CACHE, SHELL_CACHE } from './sw-policy';

/** The subset of CacheStorage this module actually needs — kept minimal so
 * tests can pass a plain mock instead of a real CacheStorage. */
export interface CacheStorageLike {
  delete(name: string): Promise<boolean>;
}

/**
 * Clears the cached API data (note lists, note bodies, folders, tags) and
 * cached navigations (the app shell HTML) so a shared device's next
 * sign-out doesn't leave the previous user's notes servable offline.
 *
 * Called directly from the sign-out flow (AppShell's onSignOut) rather
 * than only relying on the service worker's own user-mismatch detection —
 * this path fires immediately, on every explicit sign-out, with no
 * round-trip through postMessage or a marker cache. `caches` is the same
 * origin-scoped CacheStorage the service worker reads from, so deleting it
 * here works even if no service worker is currently controlling the page.
 *
 * Best-effort: browsers without the Cache API (or a page loaded without
 * one, e.g. some test environments) just no-op.
 */
export async function clearSessionCaches(
  cachesApi: CacheStorageLike | undefined = typeof caches !== 'undefined' ? caches : undefined,
): Promise<void> {
  if (!cachesApi) return;
  try {
    await Promise.all([cachesApi.delete(DATA_CACHE), cachesApi.delete(SHELL_CACHE)]);
  } catch {
    // Best-effort — a failure here must never block sign-out.
  }
}

/**
 * Tells any active service worker that sign-out happened, as a second line
 * of defence alongside clearSessionCaches() above (e.g. a previous SW
 * version, or a case where the direct cache delete above didn't run in the
 * same task before navigation). No-ops if there's no controller yet.
 */
export function notifyServiceWorkerLogout(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (!controller) return;
  try {
    controller.postMessage({ type: 'SN_LOGOUT' });
  } catch {
    // Best-effort.
  }
}
