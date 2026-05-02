import { describe, expect, it } from 'vitest';
import { WrapBlobSchema } from './encryption-service';

const validWrap = {
  v: 1,
  kdf: 'PBKDF2-SHA256' as const,
  iters: 600_000,
  salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  iv: 'AAAAAAAAAAAAAAAA',
  ct: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};

describe('WrapBlobSchema', () => {
  it('accepts a well-formed wrap blob from the canonical client', () => {
    expect(WrapBlobSchema.parse(validWrap)).toEqual(validWrap);
  });

  it('rejects an unsupported KDF', () => {
    const bad = { ...validWrap, kdf: 'scrypt' };
    expect(WrapBlobSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an iteration count below the safety floor', () => {
    const tooLow = { ...validWrap, iters: 500 };
    expect(WrapBlobSchema.safeParse(tooLow).success).toBe(false);
  });

  it('rejects an iteration count above the safety ceiling (DoS guard)', () => {
    const tooHigh = { ...validWrap, iters: 100_000_000 };
    expect(WrapBlobSchema.safeParse(tooHigh).success).toBe(false);
  });

  it('rejects a missing field', () => {
    const missing = { ...validWrap } as Record<string, unknown>;
    delete missing.iv;
    expect(WrapBlobSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects a non-positive version', () => {
    expect(WrapBlobSchema.safeParse({ ...validWrap, v: 0 }).success).toBe(false);
    expect(WrapBlobSchema.safeParse({ ...validWrap, v: -1 }).success).toBe(false);
  });

  it('rejects empty string fields', () => {
    expect(WrapBlobSchema.safeParse({ ...validWrap, salt: '' }).success).toBe(false);
    expect(WrapBlobSchema.safeParse({ ...validWrap, iv: '' }).success).toBe(false);
    expect(WrapBlobSchema.safeParse({ ...validWrap, ct: '' }).success).toBe(false);
  });
});
