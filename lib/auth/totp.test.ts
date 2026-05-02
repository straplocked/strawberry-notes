import { describe, expect, it } from 'vitest';
import { generate } from 'otplib';
import {
  __TEST,
  findRecoveryCodeIndex,
  generateEnrollmentMaterial,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyTotpCode,
} from './totp';

describe('generateRecoveryCodes', () => {
  it('returns the configured count', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(__TEST.RECOVERY_CODE_COUNT);
  });

  it('uses only the unambiguous alphabet', () => {
    const codes = generateRecoveryCodes();
    const allowed = new Set(__TEST.RECOVERY_ALPHABET);
    for (const c of codes) {
      const bare = c.replace(/-/g, '');
      expect(bare).toHaveLength(__TEST.RECOVERY_CODE_LEN);
      for (const ch of bare) expect(allowed.has(ch)).toBe(true);
    }
  });

  it('codes are unique within a single batch (overwhelming probability)', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('hashRecoveryCodes + findRecoveryCodeIndex', () => {
  it('a freshly issued code matches its own hash', async () => {
    const codes = generateRecoveryCodes();
    const records = await hashRecoveryCodes(codes);
    const idx = await findRecoveryCodeIndex(records, codes[3]);
    expect(idx).toBe(3);
  });

  it('returns -1 for an unknown code', async () => {
    const codes = generateRecoveryCodes();
    const records = await hashRecoveryCodes(codes);
    expect(await findRecoveryCodeIndex(records, 'XXXXX-XXXXX')).toBe(-1);
  });

  it('skips codes already marked used', async () => {
    const codes = generateRecoveryCodes();
    const records = await hashRecoveryCodes(codes);
    records[3].usedAt = new Date().toISOString();
    expect(await findRecoveryCodeIndex(records, codes[3])).toBe(-1);
  });

  it('normalizes input — case + dashes', async () => {
    const records = await hashRecoveryCodes(['ABCDE-FGHJK']);
    expect(await findRecoveryCodeIndex(records, 'abcdefghjk')).toBe(0);
    expect(await findRecoveryCodeIndex(records, 'ab cd e-f gh jk')).toBe(0);
  });
});

describe('verifyTotpCode', () => {
  it('matches a code generated from the same secret', async () => {
    const { secret } = await generateEnrollmentMaterial('alice@example.com');
    const token = await generate({
      secret,
      algorithm: __TEST.TOTP_OPTIONS.algorithm,
      digits: __TEST.TOTP_OPTIONS.digits,
      period: __TEST.TOTP_OPTIONS.period,
    });
    expect(await verifyTotpCode(secret, token)).toBe(true);
  });

  it('rejects garbage', async () => {
    const { secret } = await generateEnrollmentMaterial('bob@example.com');
    expect(await verifyTotpCode(secret, '000000')).toBe(false);
    expect(await verifyTotpCode(secret, 'abcdef')).toBe(false);
    expect(await verifyTotpCode(secret, '')).toBe(false);
  });
});

describe('generateEnrollmentMaterial', () => {
  it('returns secret, otpauth URL, QR data URL, and recovery codes', async () => {
    const m = await generateEnrollmentMaterial('user@example.com');
    expect(m.secret.length).toBeGreaterThan(0);
    expect(m.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(m.otpauthUrl).toContain(encodeURIComponent('Strawberry Notes'));
    expect(m.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(m.recoveryCodes).toHaveLength(__TEST.RECOVERY_CODE_COUNT);
  });
});
