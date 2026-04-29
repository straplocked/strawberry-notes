import { describe, expect, it, vi, beforeEach } from 'vitest';

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock('../db/client', () => {
  const buildSelect = () => ({
    from: () => ({
      where: () => Promise.resolve(selectMock()),
    }),
  });
  return {
    db: {
      select: () => buildSelect(),
    },
  };
});

import {
  __TEST,
  consumePasswordResetToken,
  issuePasswordResetTokenForEmail,
} from './password-reset';

beforeEach(() => {
  selectMock.mockReset();
});

describe('hashToken', () => {
  it('is deterministic and 64-hex', () => {
    const a = __TEST.hashToken('srt_abc');
    const b = __TEST.hashToken('srt_abc');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs per input', () => {
    expect(__TEST.hashToken('srt_a')).not.toBe(__TEST.hashToken('srt_b'));
  });
});

describe('issuePasswordResetTokenForEmail', () => {
  it('returns null for an empty email without hitting the db', async () => {
    const out = await issuePasswordResetTokenForEmail('');
    expect(out).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('returns null when no user matches the email', async () => {
    selectMock.mockReturnValueOnce([]);
    const out = await issuePasswordResetTokenForEmail('ghost@example.com');
    expect(out).toBeNull();
  });
});

describe('consumePasswordResetToken — early-return paths (no DB)', () => {
  it('rejects an empty token', async () => {
    const r = await consumePasswordResetToken('', 'longenoughpw');
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token without the srt_ prefix', async () => {
    const r = await consumePasswordResetToken('snb_abc', 'longenoughpw');
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a too-short password before consulting the db', async () => {
    const r = await consumePasswordResetToken('srt_abc', 'short');
    expect(r).toEqual({ ok: false, reason: 'password_too_short' });
  });
});

describe('TTL default', () => {
  it('is 1 hour', () => {
    expect(__TEST.DEFAULT_TTL_MS).toBe(60 * 60 * 1000);
  });
});
