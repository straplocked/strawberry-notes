/**
 * Pure routing/decision logic for the service worker (public/sw.js).
 *
 * The service worker itself is a plain, non-bundled script (registered as a
 * classic worker at `/sw.js`), so it can't `import` this TypeScript module
 * directly. Instead public/sw.js duplicates the same constants and
 * classification logic in plain JS, and lib/pwa/sw-sync.test.ts asserts the
 * two stay in sync (same cache version, same precache list, same data-path
 * prefixes). If you change something here, mirror it in public/sw.js and
 * re-run the sync test.
 */

/** Bump this whenever the SW's caching behaviour changes so existing
 * installs drop their old caches on activate instead of mixing old and new
 * cached responses. */
export const CACHE_VERSION = 'sn-v3';
export const SHELL_CACHE = `${CACHE_VERSION}-shell`;
export const DATA_CACHE = `${CACHE_VERSION}-data`;
/** Tiny cache used only to persist a "last known signed-in user" marker
 * across service-worker restarts (the SW has no durable memory otherwise). */
export const META_CACHE = `${CACHE_VERSION}-meta`;

/** Static offline fallback, served for a navigation that fails with nothing
 * relevant already cached. Must be precached (see PRECACHE_URLS) so it's
 * available even when the origin server itself is unreachable. */
export const OFFLINE_URL = '/offline.html';

/** Routes that always exist regardless of runtime config (unlike /signup,
 * which 404s when public signup is disabled — the common production
 * setting). `cache.add()` is called per-item with the failure tolerated,
 * so one missing/failing route never aborts the rest of the precache. */
export const PRECACHE_URLS = ['/', '/notes', '/login', '/manifest.webmanifest', OFFLINE_URL];

/** GET requests under any of these path prefixes are the "data" the app
 * reads offline (note lists, note bodies, folders, tags). */
export const DATA_PATH_PREFIXES = ['/api/notes', '/api/folders', '/api/tags'];

/** Synthetic request URL used as the key for the "current user" marker
 * stored in META_CACHE. Never sent over the network — Cache API keys don't
 * have to be fetchable, only unique. */
export const USER_MARKER_URL = 'https://sn-sw-meta.invalid/current-user';

export type RequestStrategy = 'ignore' | 'data' | 'navigate' | 'static-hashed' | 'static-other';

export interface ClassifiableRequest {
  method: string;
  /** Full request URL (absolute). */
  url: string;
  /** `Request.mode`, e.g. 'navigate'. */
  mode?: string;
  /** Whether the request's origin matches the service worker's own origin. */
  sameOrigin: boolean;
}

/**
 * Decide how the fetch handler should treat a request.
 *
 * - 'data': network-first with an offline cache fallback, wiped on 401.
 * - 'navigate': network-first; on failure, serve the exact cached page if
 *   we have it, else the static offline page. Never falls back to a
 *   *different* cached page (e.g. a stale /notes) for an unrelated route.
 * - 'static-hashed': cache-first — safe because /_next/static/* filenames
 *   are content-hashed and therefore immutable.
 * - 'static-other': network-first with a cache fallback — covers
 *   manifest/icons/offline.html, which are NOT content-hashed and must not
 *   be served stale forever after a deploy.
 * - 'ignore': not a GET, or cross-origin — let the browser handle it.
 */
export function classifyRequest(req: ClassifiableRequest): RequestStrategy {
  if (req.method !== 'GET') return 'ignore';
  if (!req.sameOrigin) return 'ignore';

  let pathname: string;
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    return 'ignore';
  }

  if (DATA_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return 'data';
  if (req.mode === 'navigate') return 'navigate';
  if (pathname.startsWith('/_next/static/')) return 'static-hashed';
  return 'static-other';
}

/**
 * Whether the SW should wipe cached data + shell navigations because the
 * signed-in user has changed since the last time we saw a session.
 *
 * - No incoming user (signed out / never signed in): never wipe here — the
 *   explicit sign-out flow clears caches directly and immediately; this
 *   path exists for the case where that never ran (browser closed without
 *   signing out) and a *different* user later signs in.
 * - No stored user yet (first observation this SW lifetime): nothing to
 *   compare against, don't wipe.
 * - Stored and incoming both present and different: wipe.
 */
export function shouldWipeForUserChange(
  storedUserId: string | null,
  incomingUserId: string | null,
): boolean {
  if (!incomingUserId) return false;
  if (!storedUserId) return false;
  return storedUserId !== incomingUserId;
}

/** Cache names (out of whatever currently exists) that should be dropped
 * when a user-change is detected. Keeps META_CACHE (it holds the marker we
 * just need to update, not anything user-data-bearing). */
export function cacheNamesToWipeOnUserChange(existingCacheNames: string[]): string[] {
  return existingCacheNames.filter((name) => name === SHELL_CACHE || name === DATA_CACHE);
}

/** Cache names that are stale versions and should be dropped on activate. */
export function cacheNamesToDeleteOnActivate(existingCacheNames: string[]): string[] {
  return existingCacheNames.filter((name) => !name.startsWith(CACHE_VERSION));
}
