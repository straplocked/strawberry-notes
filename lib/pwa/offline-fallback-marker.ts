import { reportOfflineFallbackServed } from './network-status';

/**
 * Side-effect module: checks whether the *currently loaded* document was
 * served by the service worker's offline cache fallback (see
 * public/sw.js's markOffline()) rather than fetched live, and flips the
 * offline banner on if so.
 *
 * This matters because the SW's fallback is otherwise invisible to page
 * code: a cached /notes shell renders normally, and its own /api/* fetches
 * also transparently succeed from the data cache (see networkFirstData in
 * public/sw.js), so lib/api/client.ts never observes a rejected fetch()
 * either. navigator.onLine doesn't help — the network interface can be
 * perfectly "online" while only the app's own server is unreachable
 * (exactly what a killed/crashed backend container looks like). The SW is
 * the only thing that actually knows a live fetch failed, so it stamps
 * `window.__SN_OFFLINE_FALLBACK__` onto the HTML it serves instead of the
 * marker relying on the client to (incorrectly) infer offline-ness itself.
 *
 * The marker is set by an inline <script> at the very top of <head> in
 * the served HTML (see markOffline() in public/sw.js), not a DOM
 * attribute — an attribute on <html> can get reconciled away by React
 * hydration before this module's import even runs, since React's bundle
 * loads as an async/module script. A classic inline script, by contrast,
 * is guaranteed to execute synchronously during HTML parsing, before any
 * async/module script and before hydration — so it's the only
 * ordering-safe way to hand this signal to app code. Import this module
 * for its own side effect, as early as possible (see
 * components/app/Providers.tsx), so the check runs alongside hydration
 * rather than after some indeterminate delay.
 */
declare global {
  interface Window {
    __SN_OFFLINE_FALLBACK__?: boolean;
  }
}

if (typeof window !== 'undefined' && window.__SN_OFFLINE_FALLBACK__ === true) {
  reportOfflineFallbackServed();
}
