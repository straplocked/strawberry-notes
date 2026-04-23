import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { corsHeaders, preflight, withCors } from './cors';

describe('cors helper', () => {
  it('reflects the caller origin', () => {
    const req = new Request('https://notes.example.com/api/folders', {
      headers: { origin: 'chrome-extension://abc123' },
    });
    const h = corsHeaders(req);
    expect(h['Access-Control-Allow-Origin']).toBe('chrome-extension://abc123');
    expect(h['Access-Control-Allow-Methods']).toContain('GET');
    expect(h['Access-Control-Allow-Headers']).toContain('Authorization');
    expect(h.Vary).toBe('Origin');
  });

  it('returns null origin when no Origin header is present', () => {
    const req = new Request('https://notes.example.com/api/folders');
    expect(corsHeaders(req)['Access-Control-Allow-Origin']).toBe('null');
  });

  it('rejects arbitrary third-party origins with null', () => {
    const req = new Request('https://notes.example.com/api/folders', {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(corsHeaders(req)['Access-Control-Allow-Origin']).toBe('null');
  });

  it('preflight returns 204 with CORS headers', () => {
    const req = new Request('https://notes.example.com/api/folders', {
      method: 'OPTIONS',
      headers: { origin: 'chrome-extension://abc123' },
    });
    const res = preflight(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('chrome-extension://abc123');
  });

  it('withCors attaches headers to an existing response', () => {
    const req = new Request('https://notes.example.com/api/folders', {
      headers: { origin: 'moz-extension://xyz' },
    });
    const res = withCors(req, NextResponse.json({ ok: true }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('moz-extension://xyz');
  });
});
