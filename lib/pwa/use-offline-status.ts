import { useSyncExternalStore } from 'react';
import { getOfflineSnapshot, getServerSnapshot, subscribeOffline } from './network-status';

/** True when the app should show its offline indicator — see
 * lib/pwa/network-status.ts for what feeds this. */
export function useOfflineStatus(): boolean {
  return useSyncExternalStore(subscribeOffline, getOfflineSnapshot, getServerSnapshot);
}
