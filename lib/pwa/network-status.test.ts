import { afterEach, describe, expect, it } from 'vitest';
import {
  getOfflineSnapshot,
  isLikelyNetworkError,
  reportNetworkFailure,
  reportNetworkSuccess,
  reportOfflineFallbackServed,
  subscribeOffline,
} from './network-status';

afterEach(() => {
  // Reset shared module state between tests.
  reportNetworkSuccess();
});

describe('isLikelyNetworkError', () => {
  it('treats TypeError as a network error (fetch() rejection shape)', () => {
    expect(isLikelyNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('treats a plain HTTP error (thrown after a normal response) as not a network error', () => {
    expect(isLikelyNetworkError(new Error('404 Not Found: nope'))).toBe(false);
  });

  it('handles non-error values without throwing', () => {
    expect(isLikelyNetworkError(null)).toBe(false);
    expect(isLikelyNetworkError('a string')).toBe(false);
  });
});

describe('reportNetworkFailure / reportNetworkSuccess', () => {
  it('flips the offline snapshot to true on a network-shaped failure', () => {
    reportNetworkFailure(new TypeError('Failed to fetch'));
    expect(getOfflineSnapshot()).toBe(true);
  });

  it('ignores non-network errors', () => {
    reportNetworkFailure(new Error('500 Internal Server Error'));
    expect(getOfflineSnapshot()).toBe(false);
  });

  it('clears back to false on reportNetworkSuccess', () => {
    reportNetworkFailure(new TypeError('Failed to fetch'));
    expect(getOfflineSnapshot()).toBe(true);
    reportNetworkSuccess();
    expect(getOfflineSnapshot()).toBe(false);
  });

  it('reportOfflineFallbackServed() flips the snapshot with no error-shape filtering', () => {
    reportOfflineFallbackServed();
    expect(getOfflineSnapshot()).toBe(true);
  });

  it('notifies subscribers when the snapshot changes', () => {
    let notified = 0;
    const unsubscribe = subscribeOffline(() => {
      notified += 1;
    });
    reportNetworkFailure(new TypeError('Failed to fetch'));
    reportNetworkFailure(new TypeError('Failed to fetch')); // no duplicate notify
    expect(notified).toBe(1);
    unsubscribe();
  });
});
