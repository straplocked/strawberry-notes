import { describe, expect, it, vi } from 'vitest';
import { DATA_CACHE, SHELL_CACHE } from './sw-policy';
import { clearSessionCaches, notifyServiceWorkerLogout } from './clear-session-caches';

describe('clearSessionCaches', () => {
  it('deletes exactly the data + shell caches, not the meta marker cache', async () => {
    const deleted: string[] = [];
    const fakeCaches = {
      delete: vi.fn(async (name: string) => {
        deleted.push(name);
        return true;
      }),
    };

    await clearSessionCaches(fakeCaches);

    expect(deleted.sort()).toEqual([DATA_CACHE, SHELL_CACHE].sort());
  });

  it('is a no-op (and does not throw) when there is no CacheStorage', async () => {
    await expect(clearSessionCaches(undefined)).resolves.toBeUndefined();
  });

  it('swallows errors from the underlying CacheStorage', async () => {
    const fakeCaches = {
      delete: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    await expect(clearSessionCaches(fakeCaches)).resolves.toBeUndefined();
  });
});

describe('notifyServiceWorkerLogout', () => {
  it('does nothing when there is no active service worker controller', () => {
    expect(() => notifyServiceWorkerLogout()).not.toThrow();
  });

  it('posts an SN_LOGOUT message when a controller is present', () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: { postMessage } },
      configurable: true,
    });

    notifyServiceWorkerLogout();

    expect(postMessage).toHaveBeenCalledWith({ type: 'SN_LOGOUT' });

    // @ts-expect-error cleaning up the test shim
    delete navigator.serviceWorker;
  });
});
