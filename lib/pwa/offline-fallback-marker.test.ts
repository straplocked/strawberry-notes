import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  document.documentElement.removeAttribute('data-sn-offline');
  vi.resetModules();
});

describe('offline-fallback-marker (import side effect)', () => {
  it('reports the offline fallback when the document carries the SW marker attribute', async () => {
    document.documentElement.setAttribute('data-sn-offline', '1');
    const { getOfflineSnapshot } = await import('./network-status');
    await import('./offline-fallback-marker');
    expect(getOfflineSnapshot()).toBe(true);
  });

  it('does nothing when the marker attribute is absent (normal online load)', async () => {
    const { getOfflineSnapshot } = await import('./network-status');
    await import('./offline-fallback-marker');
    expect(getOfflineSnapshot()).toBe(false);
  });
});
