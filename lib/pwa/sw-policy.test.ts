import { describe, expect, it } from 'vitest';
import {
  cacheNamesToDeleteOnActivate,
  cacheNamesToWipeOnUserChange,
  CACHE_VERSION,
  classifyRequest,
  DATA_CACHE,
  META_CACHE,
  OFFLINE_URL,
  PRECACHE_URLS,
  shouldWipeForUserChange,
  SHELL_CACHE,
  STATIC_CACHE,
} from './sw-policy';

const ORIGIN = 'https://strawberrynotes.example';

function req(overrides: Partial<Parameters<typeof classifyRequest>[0]> = {}) {
  return classifyRequest({
    method: 'GET',
    url: `${ORIGIN}/`,
    mode: 'same-origin',
    sameOrigin: true,
    ...overrides,
  });
}

describe('classifyRequest', () => {
  it('ignores non-GET requests', () => {
    expect(req({ method: 'POST', url: `${ORIGIN}/api/notes` })).toBe('ignore');
  });

  it('ignores cross-origin requests', () => {
    expect(req({ url: 'https://other.example/api/notes', sameOrigin: false })).toBe('ignore');
  });

  it('classifies note/folder/tag API GETs as data', () => {
    expect(req({ url: `${ORIGIN}/api/notes` })).toBe('data');
    expect(req({ url: `${ORIGIN}/api/notes/abc-123` })).toBe('data');
    expect(req({ url: `${ORIGIN}/api/folders` })).toBe('data');
    expect(req({ url: `${ORIGIN}/api/tags` })).toBe('data');
  });

  it('does not classify unrelated API GETs as data (must not cache auth/session)', () => {
    expect(req({ url: `${ORIGIN}/api/auth/session` })).toBe('static-other');
  });

  it('classifies navigations as navigate', () => {
    expect(req({ url: `${ORIGIN}/notes`, mode: 'navigate' })).toBe('navigate');
  });

  it('classifies hashed next static assets as cache-first candidates', () => {
    expect(req({ url: `${ORIGIN}/_next/static/chunks/app.abc123.js` })).toBe('static-hashed');
  });

  it('classifies everything else same-origin as static-other (network-first)', () => {
    expect(req({ url: `${ORIGIN}/icons/icon-192.png` })).toBe('static-other');
    expect(req({ url: `${ORIGIN}/manifest.webmanifest` })).toBe('static-other');
  });

  it('treats an unparsable URL as ignore rather than throwing', () => {
    expect(req({ url: 'not a url' })).toBe('ignore');
  });
});

describe('shouldWipeForUserChange', () => {
  it('does not wipe when there is no stored user yet', () => {
    expect(shouldWipeForUserChange(null, 'user-a')).toBe(false);
  });

  it('does not wipe when there is no incoming user', () => {
    expect(shouldWipeForUserChange('user-a', null)).toBe(false);
  });

  it('does not wipe when the user is unchanged', () => {
    expect(shouldWipeForUserChange('user-a', 'user-a')).toBe(false);
  });

  it('wipes when a different user signs in on the same device', () => {
    expect(shouldWipeForUserChange('user-a', 'user-b')).toBe(true);
  });
});

describe('cacheNamesToWipeOnUserChange', () => {
  it('picks only the shell + data caches, never the meta marker cache', () => {
    const names = [SHELL_CACHE, DATA_CACHE, META_CACHE, 'unrelated-cache'];
    expect(cacheNamesToWipeOnUserChange(names).sort()).toEqual([DATA_CACHE, SHELL_CACHE].sort());
  });

  it('never wipes STATIC_CACHE (the offline fallback page must survive a user change/sign-out)', () => {
    const names = [SHELL_CACHE, DATA_CACHE, META_CACHE, STATIC_CACHE];
    expect(cacheNamesToWipeOnUserChange(names)).not.toContain(STATIC_CACHE);
  });
});

describe('STATIC_CACHE', () => {
  it('is a distinct cache from SHELL_CACHE, derived from CACHE_VERSION', () => {
    expect(STATIC_CACHE).toBe(`${CACHE_VERSION}-static`);
    expect(STATIC_CACHE).not.toBe(SHELL_CACHE);
  });

  it('is where OFFLINE_URL is expected to live, not SHELL_CACHE — see public/sw.js', () => {
    // Documents the intent (public/sw.js's install handler routes
    // OFFLINE_URL into STATIC_CACHE specifically) — the actual runtime
    // routing is only expressible in the SW itself, verified live via
    // Docker+Playwright, but this pins the constants that decision
    // depends on so they can't silently diverge.
    expect(PRECACHE_URLS).toContain(OFFLINE_URL);
    expect(STATIC_CACHE).not.toBe(SHELL_CACHE);
  });
});

describe('cacheNamesToDeleteOnActivate', () => {
  it('drops caches from older SW versions and keeps current-version caches', () => {
    const names = [SHELL_CACHE, DATA_CACHE, META_CACHE, 'sn-v2-shell', 'sn-v2-data'];
    expect(cacheNamesToDeleteOnActivate(names).sort()).toEqual(['sn-v2-data', 'sn-v2-shell'].sort());
  });
});

describe('constants', () => {
  it('always precaches the static offline fallback page', () => {
    expect(PRECACHE_URLS).toContain('/offline.html');
  });

  it('never precaches /signup (404s when public signup is disabled)', () => {
    expect(PRECACHE_URLS).not.toContain('/signup');
  });

  it('derives cache names from CACHE_VERSION', () => {
    expect(SHELL_CACHE).toBe(`${CACHE_VERSION}-shell`);
    expect(DATA_CACHE).toBe(`${CACHE_VERSION}-data`);
    expect(META_CACHE).toBe(`${CACHE_VERSION}-meta`);
  });
});
