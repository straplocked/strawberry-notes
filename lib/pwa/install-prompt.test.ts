import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInstallSnapshot, isIOS, isStandalone, promptInstall, subscribeInstall } from './install-prompt';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getInstallSnapshot / promptInstall', () => {
  it('reports canPrompt=false and promptInstall()="unavailable" with no captured event', async () => {
    expect(getInstallSnapshot().canPrompt).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
  });

  it('notifies subscribers when beforeinstallprompt is captured', () => {
    let notified = 0;
    const unsubscribe = subscribeInstall(() => {
      notified += 1;
    });
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);
    expect(notified).toBe(1);
    expect(getInstallSnapshot().canPrompt).toBe(true);
    unsubscribe();
  });
});

describe('isStandalone', () => {
  it('is true when display-mode: standalone matches', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    expect(isStandalone()).toBe(true);
  });

  it('is false when nothing matches', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })),
    );
    expect(isStandalone()).toBe(false);
  });
});

describe('isIOS', () => {
  it('detects an iPhone user agent', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    expect(isIOS()).toBe(true);
  });

  it('does not flag a desktop Chrome user agent', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
    });
    expect(isIOS()).toBe(false);
  });
});
