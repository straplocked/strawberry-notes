/* Strawberry Notes — PWA service worker.
 *
 * Shell precache + network-first for API GETs, network-first for
 * navigations (falling back to an exact cached match or the static offline
 * page — never to an unrelated stale page), cache-first only for
 * content-hashed /_next/static/* assets, and network-first for everything
 * else static (icons, manifest, offline.html) so those aren't stuck stale
 * after a deploy. Edits are not queued in v1 — failed PATCH/POSTs surface
 * to the UI as an offline indicator instead.
 *
 * Privacy: the data cache (note/folder/tag API responses) and the shell
 * cache (cached navigations) are wiped on sign-out (see
 * lib/pwa/clear-session-caches.ts, called from AppShell's sign-out flow)
 * and, as a second line of defence for the "never explicitly signed out"
 * case, whenever this worker sees a different signed-in user than the last
 * one it observed (see the 'message' handler below) or a 401 from the API.
 *
 * KEEP IN SYNC with lib/pwa/sw-policy.ts — this file can't `import` that
 * TypeScript module (classic, non-bundled worker script), so the constants
 * and classification logic are duplicated here. lib/pwa/sw-sync.test.ts
 * asserts the two don't drift.
 */

const CACHE_VERSION = 'sn-v3';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const META_CACHE = `${CACHE_VERSION}-meta`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = ['/', '/notes', '/login', '/manifest.webmanifest', OFFLINE_URL];
const DATA_PATH_PREFIXES = ['/api/notes', '/api/folders', '/api/tags'];
const USER_MARKER_URL = 'https://sn-sw-meta.invalid/current-user';

function classifyRequest(req) {
  if (req.method !== 'GET') return 'ignore';
  if (!req.sameOrigin) return 'ignore';
  let pathname;
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            // Route not available in this deployment (e.g. /signup 404s
            // when public signup is off) — skip it, don't abort the rest.
          }),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  let sameOrigin = false;
  try {
    sameOrigin = new URL(req.url).origin === self.location.origin;
  } catch {
    sameOrigin = false;
  }
  const strategy = classifyRequest({ method: req.method, url: req.url, mode: req.mode, sameOrigin });

  if (strategy === 'data') {
    event.respondWith(networkFirstData(event, req));
  } else if (strategy === 'navigate') {
    event.respondWith(handleNavigate(event, req));
  } else if (strategy === 'static-hashed') {
    event.respondWith(cacheFirstHashed(event, req));
  } else if (strategy === 'static-other') {
    event.respondWith(networkFirstStatic(event, req));
  }
  // 'ignore' — don't call respondWith; let the browser handle it normally.
});

// Every strategy below threads the fetch `event` through so any cache
// write that shouldn't block the response is wrapped in
// event.waitUntil(...) instead of being a bare unawaited promise. Without
// that, the browser is free to suspend/terminate the worker the instant
// respondWith()'s promise resolves — a fire-and-forget cache.put() can
// lose the race and never actually persist, silently defeating both the
// offline-read feature and (for the data cache specifically) this SW's
// own privacy bookkeeping.

// API: network-first so fresh data wins whenever online; cached response
// covers short offline windows. A 401 means the session ended (sign-out
// elsewhere, expired cookie) — never cache it, and proactively drop
// whatever was cached so a *different* user signing in on this device
// afterward can't be served the previous user's notes offline.
async function networkFirstData(event, req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req);
    if (res.status === 401) {
      event.waitUntil(cache.keys().then((keys) => Promise.all(keys.map((k) => cache.delete(k)))));
      return res;
    }
    if (res.ok) event.waitUntil(cache.put(req, res.clone()));
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

// Navigation: network-first. On failure, only serve back the *same* page
// if we already have it cached (the legitimate "read my own recent notes
// offline" case) — never a different, unrelated cached page. With nothing
// relevant cached, fall back to the static offline page instead of staying
// silent about it.
async function handleNavigate(event, req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    event.waitUntil(cache.put(req, res.clone()));
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return markOffline(cached);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return markOffline(offline);
    throw err;
  }
}

// A cached page served in place of a failed live fetch is otherwise
// indistinguishable, client-side, from a normal online response — the
// page's own fetch()es to /api/* also transparently succeed from the data
// cache (see networkFirstData), so lib/api/client.ts never sees a
// rejected fetch() either. Stamp a marker onto the served HTML itself
// (rather than a header, which client-side JS has no reliable way to read
// back for its own document) so lib/pwa/offline-fallback-marker.ts can
// flip the app's "Offline — showing saved notes" banner on. Cheap string
// rewrite: these are our own precached/cached app-shell responses, never
// third-party content.
async function markOffline(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return res;
  const text = await res.text();
  const marked = text.includes('<html ')
    ? text.replace('<html ', '<html data-sn-offline="1" ')
    : text.replace('<html>', '<html data-sn-offline="1">');
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(marked, { status: res.status, statusText: res.statusText, headers });
}

// Hashed /_next/static/* chunks are content-addressed and therefore safe to
// cache-first — a new deploy ships new filenames, it never mutates an old
// one, so there's no staleness risk.
async function cacheFirstHashed(event, req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) event.waitUntil(cache.put(req, res.clone()));
  return res;
}

// Everything else static (icons, manifest, offline.html itself) is NOT
// content-hashed, so it must not be cache-first forever — network-first
// keeps it fresh after a deploy while still working offline.
async function networkFirstStatic(event, req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) event.waitUntil(cache.put(req, res.clone()));
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

// The client posts the current signed-in user's id on every session load
// (see lib/pwa/session-sw-sync.ts). If it's different from the last user
// this worker observed, a different person signed in on this device
// without an explicit sign-out ever reaching us (browser closed, session
// cookie cleared some other way, etc.) — wipe the data + shell caches so
// they can't be served the previous user's notes.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SN_SESSION' && typeof data.userId === 'string' && data.userId) {
    event.waitUntil(handleSessionUser(data.userId));
  } else if (data.type === 'SN_LOGOUT') {
    event.waitUntil(
      Promise.all([caches.delete(SHELL_CACHE), caches.delete(DATA_CACHE)]),
    );
  }
});

async function handleSessionUser(userId) {
  const metaCache = await caches.open(META_CACHE);
  const markerReq = new Request(USER_MARKER_URL);
  const existing = await metaCache.match(markerReq);
  const storedUserId = existing ? await existing.text() : null;
  if (storedUserId && storedUserId !== userId) {
    await Promise.all([caches.delete(SHELL_CACHE), caches.delete(DATA_CACHE)]);
  }
  await metaCache.put(markerReq, new Response(userId));
}
