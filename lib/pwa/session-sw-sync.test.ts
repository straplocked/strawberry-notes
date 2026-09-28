import { describe, expect, it, vi } from 'vitest';
import { postSessionToServiceWorker } from './session-sw-sync';

describe('postSessionToServiceWorker', () => {
  it('does nothing without a userId', () => {
    expect(() => postSessionToServiceWorker(null)).not.toThrow();
    expect(() => postSessionToServiceWorker(undefined)).not.toThrow();
  });

  it('does nothing without an active controller', () => {
    expect(() => postSessionToServiceWorker('user-a')).not.toThrow();
  });

  it('posts an SN_SESSION message with the user id when a controller exists', () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: { postMessage } },
      configurable: true,
    });

    postSessionToServiceWorker('user-a');

    expect(postMessage).toHaveBeenCalledWith({ type: 'SN_SESSION', userId: 'user-a' });

    // @ts-expect-error cleaning up the test shim
    delete navigator.serviceWorker;
  });
});
