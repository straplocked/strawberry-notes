import { describe, expect, it } from 'vitest';
import { generateSecret, hashSecret, signPayload, signatureHeader } from './secret';

describe('webhook secret helpers', () => {
  it('generates a whsec_-prefixed 64-hex secret', () => {
    const s = generateSecret();
    expect(s).toMatch(/^whsec_[0-9a-f]{64}$/);
  });

  it('issues unique secrets', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });

  it('hashSecret is stable and 64-hex', () => {
    const s = 'whsec_test';
    const h1 = hashSecret(s);
    const h2 = hashSecret(s);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signPayload returns deterministic hex for the same key+body', () => {
    const sig1 = signPayload('secret', '{"a":1}');
    const sig2 = signPayload('secret', '{"a":1}');
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signPayload differs when key or body differs', () => {
    expect(signPayload('s1', 'x')).not.toBe(signPayload('s2', 'x'));
    expect(signPayload('s1', 'x')).not.toBe(signPayload('s1', 'y'));
  });

  it('signatureHeader prefixes with sha256=', () => {
    const header = signatureHeader('secret', 'body');
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
