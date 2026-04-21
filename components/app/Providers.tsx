'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { hydrateSettingsFromStorage, useUIStore } from '@/lib/store/ui-store';
import { dlog } from '@/lib/debug';

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
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}
