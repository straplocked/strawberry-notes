import { describe, expect, it, vi, beforeEach } from 'vitest';

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock('../db/client', () => {
  const buildSelect = () => ({
    from: () => ({
      where: () => Promise.resolve(selectMock()),
    }),
  });
  return { db: { select: () => buildSelect() } };
});

import {
  __TEST,
  consumeEmailConfirmationToken,
  isEmailConfirmedByEmail,
  isUserEmailConfirmed,
  issueEmailConfirmationTokenForEmail,
} from './email-confirmation';

beforeEach(() => {
  selectMock.mockReset();
});

describe('hashToken', () => {
  it('is stable + 64-hex', () => {
    const a = __TEST.hashToken('ecf_abc');
    const b = __TEST.hashToken('ecf_abc');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('TTL default', () => {
  it('is 24 hours', () => {
    expect(__TEST.DEFAULT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('issueEmailConfirmationTokenForEmail', () => {
  it('returns null for an empty email', async () => {
    expect(await issueEmailConfirmationTokenForEmail('')).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('returns null when the user is not found', async () => {
    selectMock.mockReturnValueOnce([]);
    expect(await issueEmailConfirmationTokenForEmail('ghost@example.com')).toBeNull();
  });
});

describe('consumeEmailConfirmationToken — early-return paths (no DB)', () => {
  it('rejects empty input', async () => {
    expect(await consumeEmailConfirmationToken('')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a non-prefixed token', async () => {
    expect(await consumeEmailConfirmationToken('snb_abc')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('confirmation lookups', () => {
  it('isUserEmailConfirmed: true when emailConfirmedAt is set', async () => {
    selectMock.mockReturnValueOnce([{ confirmedAt: new Date() }]);
    expect(await isUserEmailConfirmed('user-1')).toBe(true);
  });

  it('isUserEmailConfirmed: false when null', async () => {
    selectMock.mockReturnValueOnce([{ confirmedAt: null }]);
    expect(await isUserEmailConfirmed('user-1')).toBe(false);
  });

  it('isUserEmailConfirmed: false when row missing', async () => {
    selectMock.mockReturnValueOnce([]);
    expect(await isUserEmailConfirmed('ghost')).toBe(false);
  });

  it('isEmailConfirmedByEmail: lower-cases and looks up', async () => {
    selectMock.mockReturnValueOnce([{ confirmedAt: new Date() }]);
    expect(await isEmailConfirmedByEmail('A@B.COM')).toBe(true);
  });
});
