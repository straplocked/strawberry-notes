import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPublicBaseUrl } from './public-url';

const ORIGINAL_AUTH_URL = process.env.AUTH_URL;

function makeReq(
  headers: Record<string, string>,
  url = 'http://example.test/api',
): Request {
  return new Request(url, { headers });
}

beforeEach(() => {
  delete process.env.AUTH_URL;
});

afterEach(() => {
  if (ORIGINAL_AUTH_URL === undefined) {
    delete process.env.AUTH_URL;
  } else {
    process.env.AUTH_URL = ORIGINAL_AUTH_URL;
  }
});

describe('getPublicBaseUrl', () => {
  it('uses AUTH_URL when set, ignoring the request', () => {
    process.env.AUTH_URL = 'https://notes.example.com';
    expect(getPublicBaseUrl(makeReq({ host: '192.168.1.50:3200' }))).toBe(
      'https://notes.example.com',
    );
  });

  it('strips trailing slashes from AUTH_URL', () => {
    process.env.AUTH_URL = 'https://notes.example.com///';
    expect(getPublicBaseUrl()).toBe('https://notes.example.com');
  });

  it('treats blank-string AUTH_URL as unset', () => {
    process.env.AUTH_URL = '   ';
    expect(getPublicBaseUrl(makeReq({ host: '192.168.1.50:3200' }))).toBe(
      'http://192.168.1.50:3200',
    );
  });

  it('honours X-Forwarded-Host + X-Forwarded-Proto (proxy case)', () => {
    const req = makeReq({
      'x-forwarded-host': 'notes.example.com',
      'x-forwarded-proto': 'https',
      host: 'app:3000',
    });
    expect(getPublicBaseUrl(req)).toBe('https://notes.example.com');
  });

  it('defaults forwarded proto to https when only X-Forwarded-Host is set', () => {
    const req = makeReq({
      'x-forwarded-host': 'notes.example.com',
      host: 'app:3000',
    });
    expect(getPublicBaseUrl(req)).toBe('https://notes.example.com');
  });

  it('uses the leftmost value of a comma-separated X-Forwarded-Host', () => {
    const req = makeReq({
      'x-forwarded-host': 'notes.example.com, internal-lb',
      'x-forwarded-proto': 'https, http',
    });
    expect(getPublicBaseUrl(req)).toBe('https://notes.example.com');
  });

  it('falls back to the Host header for direct LAN/dev access', () => {
    const req = makeReq({ host: '192.168.1.50:3200' });
    expect(getPublicBaseUrl(req)).toBe('http://192.168.1.50:3200');
  });

  it('infers proto from the request URL when no forwarded headers are present', () => {
    const req = makeReq({ host: 'notes.example.com' }, 'https://notes.example.com/api/x');
    expect(getPublicBaseUrl(req)).toBe('https://notes.example.com');
  });

  it('falls back to http://localhost:3200 with no env and no request', () => {
    expect(getPublicBaseUrl()).toBe('http://localhost:3200');
  });

  it('falls back to http://localhost:3200 when the request has no Host or forwarded headers', () => {
    // Reach for a Headers instance with nothing host-related populated.
    const req = { headers: new Headers({ 'x-other': 'value' }) };
    expect(getPublicBaseUrl(req)).toBe('http://localhost:3200');
  });
});
