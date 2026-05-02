import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { issueTicket, verifyTicket, MFA_TICKET_TTL_MS, __TEST } from './mfa-ticket';

const ORIGINAL_SECRET = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-please-replace-base64';
});
afterEach(() => {
  process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe('mfa ticket sign/verify', () => {
  it('round-trips for a valid ticket', () => {
    const { ticket } = issueTicket('user-123');
    const out = verifyTicket(ticket);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.userId).toBe('user-123');
  });

  it('rejects malformed input', () => {
    expect(verifyTicket('').ok).toBe(false);
    expect(verifyTicket('not.even.close').ok).toBe(false);
    expect(verifyTicket('a.b.c.d.e').ok).toBe(false);
  });

  it('rejects bad signatures', () => {
    const { ticket } = issueTicket('user-x');
    const tampered = ticket.split('.').slice(0, 3).join('.') + '.AAAAAAAA';
    expect(verifyTicket(tampered).ok).toBe(false);
  });

  it('rejects expired tickets', () => {
    const fakeNow = new Date('2020-01-01T00:00:00Z');
    const { ticket } = issueTicket('user-y', { now: fakeNow, ttlMs: 1000 });
    const after = new Date(fakeNow.getTime() + 2000);
    const out = verifyTicket(ticket, { now: after });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('expired');
  });

  it('rejects tickets signed with a different secret', () => {
    const { ticket } = issueTicket('user-z');
    process.env.AUTH_SECRET = 'a-different-secret';
    expect(verifyTicket(ticket).ok).toBe(false);
  });

  it('TTL default is 5 minutes', () => {
    expect(MFA_TICKET_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('throws when AUTH_SECRET is missing', () => {
    delete process.env.AUTH_SECRET;
    expect(() => __TEST.getSecret()).toThrow();
  });
});
