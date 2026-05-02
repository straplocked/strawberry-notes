/**
 * MFA tickets — short-lived signed handles that carry a user from a
 * successful password verification to TOTP entry without granting an
 * actual session.
 *
 * Shape: `<userId>.<exp>.<sig>` (all url-safe base64). Signed with HMAC-
 * SHA256 keyed by `AUTH_SECRET`. Verified with constant-time comparison.
 *
 * The ticket lives in an httpOnly cookie scoped to /api/auth so the login
 * form can prove "yes, this user passed the password check 4 minutes ago"
 * to the second `totp` credentials provider.
 *
 * Why a ticket instead of just trusting "user submitted email + code"?
 *   - The password is the first factor. We must have verified it.
 *   - We don't want the user re-typing their password on the TOTP screen.
 *   - We don't want a leaked TOTP code (e.g. shoulder-surfed) to be
 *     usable on its own — the ticket binds it to the password attempt.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const MFA_TICKET_COOKIE = 'snb_mfa_ticket';
/** A NOT-httpOnly companion cookie; just a presence flag so the client-side
 * login form can detect "TOTP required" without exposing the signed ticket
 * to JavaScript. Has no security value on its own. */
export const MFA_PENDING_COOKIE = 'snb_mfa_pending';
export const MFA_TICKET_TTL_MS = 5 * 60 * 1000; // 5 minutes

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

function getSecret(): Buffer {
  const raw = process.env.AUTH_SECRET ?? '';
  if (!raw) throw new Error('AUTH_SECRET is required to mint MFA tickets');
  // Mix in a fixed salt so the same AUTH_SECRET signing different ticket
  // types stays domain-separated from JWT signing.
  return Buffer.from('mfa-ticket:' + raw, 'utf8');
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', getSecret()).update(payload).digest());
}

export interface IssuedTicket {
  ticket: string;
  expiresAt: Date;
}

export function issueTicket(userId: string, opts: { now?: Date; ttlMs?: number } = {}): IssuedTicket {
  const now = opts.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (opts.ttlMs ?? MFA_TICKET_TTL_MS));
  const nonce = randomBytes(8).toString('hex');
  const payload = `${b64url(userId)}.${expiresAt.getTime()}.${nonce}`;
  const ticket = `${payload}.${sign(payload)}`;
  return { ticket, expiresAt };
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyTicket(raw: string, opts: { now?: Date } = {}): VerifyResult {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'malformed' };
  const parts = raw.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };
  const [userIdB64, expStr, nonce, sig] = parts;
  if (!userIdB64 || !expStr || !nonce || !sig) return { ok: false, reason: 'malformed' };
  const expected = sign(`${userIdB64}.${expStr}.${nonce}`);
  const a = fromB64url(sig);
  const b = fromB64url(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: 'malformed' };
  const now = (opts.now ?? new Date()).getTime();
  if (now >= exp) return { ok: false, reason: 'expired' };
  const userId = fromB64url(userIdB64).toString('utf8');
  if (!userId) return { ok: false, reason: 'malformed' };
  return { ok: true, userId };
}

export const __TEST = { sign, getSecret };
