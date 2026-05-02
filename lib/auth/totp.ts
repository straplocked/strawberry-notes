/**
 * TOTP (RFC 6238) enrollment + verification, plus single-use recovery codes.
 *
 * - Algorithm: SHA1 / 6 digits / 30s step (compatible with every major
 *   authenticator app — Google Authenticator, 1Password, Authy, Aegis).
 * - Secret: 20 bytes (160 bits) base32-encoded.
 * - Accepts ±1 step skew on verification (matches industry default).
 * - Recovery codes: 8 codes × 10 chars from an unambiguous alphabet
 *   (no `0/O/1/l/I`). Stored as bcrypt hashes inside `users.totpRecoveryCodes`.
 */

import { generateSecret, generateURI, verify } from 'otplib';
import { hash as bcryptHash, compare as bcryptCompare } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import * as QRCode from 'qrcode';

const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_LEN = 10;
const RECOVERY_CODE_COUNT = 8;
const ISSUER = 'Strawberry Notes';
// `epochTolerance` is in seconds; 30s = ±1 step (industry default for TOTP).
const TOTP_OPTIONS = {
  algorithm: 'sha1' as const,
  digits: 6,
  period: 30,
  epochTolerance: 30,
};

export interface TotpEnrollmentMaterial {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
}

/** Generate a fresh TOTP secret + recovery codes. Does NOT persist anything;
 * the user has to confirm by entering a valid code at /enable. */
export async function generateEnrollmentMaterial(email: string): Promise<TotpEnrollmentMaterial> {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer: ISSUER,
    label: email,
    secret,
    algorithm: TOTP_OPTIONS.algorithm,
    digits: TOTP_OPTIONS.digits,
    period: TOTP_OPTIONS.period,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });
  const recoveryCodes = generateRecoveryCodes();
  return { secret, otpauthUrl, qrCodeDataUrl, recoveryCodes };
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  if (!secret || !code) return false;
  const cleaned = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const result = await verify({
      secret,
      token: cleaned,
      algorithm: TOTP_OPTIONS.algorithm,
      digits: TOTP_OPTIONS.digits,
      period: TOTP_OPTIONS.period,
      epochTolerance: TOTP_OPTIONS.epochTolerance,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

export function generateRecoveryCodes(): string[] {
  const out: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    out.push(generateRecoveryCode());
  }
  return out;
}

function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_CODE_LEN);
  let s = '';
  for (let i = 0; i < RECOVERY_CODE_LEN; i++) {
    s += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }
  // Group as 5-5 for human readability (BBBBB-BBBBB).
  return `${s.slice(0, 5)}-${s.slice(5, 10)}`;
}

export interface RecoveryCodeRecord {
  hash: string;
  usedAt: string | null;
}

export async function hashRecoveryCodes(codes: string[]): Promise<RecoveryCodeRecord[]> {
  const out: RecoveryCodeRecord[] = [];
  for (const c of codes) {
    out.push({ hash: await bcryptHash(normalizeRecoveryCode(c), 10), usedAt: null });
  }
  return out;
}

function normalizeRecoveryCode(c: string): string {
  return c.toUpperCase().replace(/[\s-]+/g, '');
}

/** Returns the index of a matching, not-yet-used recovery code, or -1. */
export async function findRecoveryCodeIndex(
  records: RecoveryCodeRecord[],
  attempt: string,
): Promise<number> {
  const normalized = normalizeRecoveryCode(attempt);
  if (normalized.length !== RECOVERY_CODE_LEN) return -1;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.usedAt) continue;
    const ok = await bcryptCompare(normalized, r.hash).catch(() => false);
    if (ok) return i;
  }
  return -1;
}

export const __TEST = {
  RECOVERY_ALPHABET,
  RECOVERY_CODE_LEN,
  RECOVERY_CODE_COUNT,
  ISSUER,
  TOTP_OPTIONS,
  normalizeRecoveryCode,
};
