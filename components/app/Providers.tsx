'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { hydrateSettingsFromStorage, useUIStore } from '@/lib/store/ui-store';
import { dlog } from '@/lib/debug';
import { postSessionToServiceWorker } from '@/lib/pwa/session-sw-sync';
// Side-effect import: registers the beforeinstallprompt/appinstalled
// listeners as early as possible so the one-shot beforeinstallprompt event
// isn't missed before Settings (where the Install affordance lives) mounts.
import '@/lib/pwa/install-prompt';

/** Short, loggable shape for a React-Query key. */
function fmtKey(key: readonly unknown[]): string {
  return key.map((p) => (typeof p === 'object' ? JSON.stringify(p) : String(p))).join(':');
}

/** Subscribe to the query cache and emit one log per interesting transition. */
function installQueryObserver(client: QueryClient) {
  const cache = client.getQueryCache();
  cache.subscribe((event) => {
    const q = event.query;
    const key = fmtKey(q.queryKey);
    switch (event.type) {
      case 'added':
        dlog('query', `+ ${key}`, { status: q.state.status });
        break;
      case 'removed':
        dlog('query', `− ${key}`);
        break;
      case 'updated': {
        const action = (event as { action?: { type?: string } }).action;
        const t = action?.type;
        // 'fetch' = request starting. 'success' / 'error' = result.
        // 'setState' / 'invalidate' fire a lot; only log when observer fetches.
        if (t === 'fetch') {
          dlog('query', `→ ${key} fetch`, { fetchStatus: q.state.fetchStatus });
        } else if (t === 'success') {
          dlog('query', `✓ ${key}`, { dataUpdatedAt: q.state.dataUpdatedAt });
        } else if (t === 'error') {
          dlog('query', `✗ ${key}`, { error: q.state.error });
        } else if (t === 'invalidate') {
          dlog('query', `invalidate ${key}`);
        }
        break;
      }
    }
  });

  const mutations = client.getMutationCache();
  mutations.subscribe((event) => {
    const m = event.mutation;
    if (!m) return;
    if (event.type === 'updated') {
      const action = (event as { action?: { type?: string } }).action;
      const t = action?.type;
      if (t === 'pending') dlog('query', `mut → ${m.options.mutationKey ?? 'mutate'}`);
      else if (t === 'success') dlog('query', `mut ✓`);
      else if (t === 'error') dlog('query', `mut ✗`, { error: m.state.error });
    }
  });
}

/** Log every UI-store transition with a compact diff. */
function installStoreObserver() {
  let prev = useUIStore.getState();
  useUIStore.subscribe((state) => {
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    (Object.keys(state) as (keyof typeof state)[]).forEach((k) => {
      if (typeof state[k] === 'function') return;
      if (!Object.is(state[k], prev[k])) {
        changed[k] = { from: prev[k], to: state[k] };
      }
    });
    prev = state;
    if (Object.keys(changed).length > 0) {
      dlog('store', 'ui', changed);
    }
  });
}

/**
 * Tells the active service worker who's signed in (see
 * lib/pwa/session-sw-sync.ts / public/sw.js's SN_SESSION handler) so it can
 * detect a *different* user signing in on the same device without an
 * explicit sign-out ever having reached it, and wipe cached notes then.
 * Must render inside SessionProvider.
 */
function SwSessionSync() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    if ('serviceWorker' in navigator) {
      // The controller may not be set yet on first load even though a SW
      // is registered (it only takes control after the *next* navigation)
      // — `ready` resolves once one is active, which is when postMessage
      // actually has somewhere to go.
      navigator.serviceWorker.ready
        .then(() => postSessionToServiceWorker(userId))
        .catch(() => {
          /* no SW in this environment (e.g. dev) — nothing to sync */
        });
    }
  }, [status, userId]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 20_000,
          gcTime: 5 * 60_000,
          refetchOnWindowFocus: false,
        },
      },
    });
    if (typeof window !== 'undefined') installQueryObserver(qc);
    return qc;
  });

  useEffect(() => {
    hydrateSettingsFromStorage();
    installStoreObserver();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* ignore registration errors */
      });
    }
  }, []);

  return (
    <SessionProvider>
      <SwSessionSync />
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}
