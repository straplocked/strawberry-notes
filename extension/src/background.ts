/**
 * Background service worker.
 *
 * Intentionally thin: the popup handles all clip logic directly (via
 * `chrome.scripting.executeScript`). We keep the service worker registered
 * so Chrome considers the extension active, and we log a one-line install
 * event for debugging. No keepalive, no message broker, no tokens.
 */

chrome.runtime.onInstalled.addListener((details) => {
  // eslint-disable-next-line no-console -- intentional install-time log
  console.log('[strawberry-clipper] installed:', details.reason);
});

export {};
