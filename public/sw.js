/* Strawberry Notes — minimal PWA service worker.
 *
 * Shell precache + network-first for API GETs. The previous SWR strategy
 * served stale counts on refresh even when the client was online; network-
 * first keeps online users honest, and cached responses still cover short
 * offline windows. Edits are not queued in v1 — failed PATCH/POSTs surface
 * to the UI.
 */

const CACHE_VERSION = 'sn-v2';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const PRECACHE = ['/', '/notes', '/login', '/signup', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) =>
      c.addAll(PRECACHE).catch(() => {
        /* ignore missing */
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: network-first so fresh data wins whenever online; cached response
  // is only returned when the network fails.
  if (
    url.pathname.startsWith('/api/notes') ||
    url.pathname.startsWith('/api/folders') ||
    url.pathname.startsWith('/api/tags')
  ) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // Navigation: network-first, fall back to shell cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/notes'))),
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req)),
  );
});

function networkFirst(req, cacheName) {
  return caches.open(cacheName).then((cache) =>
    fetch(req)
      .then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => cache.match(req)),
  );
}
