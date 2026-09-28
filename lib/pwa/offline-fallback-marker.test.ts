import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete window.__SN_OFFLINE_FALLBACK__;
  vi.resetModules();
});

describe('offline-fallback-marker (import side effect)', () => {
  it('reports the offline fallback when window carries the SW marker global', async () => {
    window.__SN_OFFLINE_FALLBACK__ = true;
    const { getOfflineSnapshot } = await import('./network-status');
    await import('./offline-fallback-marker');
    expect(getOfflineSnapshot()).toBe(true);
  });

  it('does nothing when the marker global is absent (normal online load)', async () => {
    const { getOfflineSnapshot } = await import('./network-status');
    await import('./offline-fallback-marker');
    expect(getOfflineSnapshot()).toBe(false);
  });
});
