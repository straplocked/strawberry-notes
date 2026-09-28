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
 * `data-sn-offline` onto the HTML it serves instead of the marker relying
 * on the client to (incorrectly) infer offline-ness itself.
 *
 * Import this module for its side effect, as early as possible (see
 * components/app/Providers.tsx), so the check runs before/alongside
 * hydration rather than after some indeterminate delay.
 */
if (typeof document !== 'undefined' && document.documentElement.hasAttribute('data-sn-offline')) {
  reportOfflineFallbackServed();
}
