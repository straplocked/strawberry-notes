/**
 * Zero-config first run: the setup-code logic in bootstrap.ts.
 *
 * `computeSetupCode` / `verifySetupCode` are pure functions over a secret
 * string, so they're tested directly. `isSetupModeActive` and
 * `createFirstAdminUser` talk to the DB, so `../db/client` is mocked with an
 * in-memory stand-in that can simulate "a user already exists" (the closed
 * case) and "another request won the advisory-lock race" (the concurrent
 * signup case).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeUser {
  id: string;
}

const state = vi.hoisted(() => ({
  users: [] as FakeUser[],
  // When set, the transaction's SELECT sees this instead of `users` — used
  // to simulate "a concurrent request inserted the first user while we were
  // waiting on the advisory lock".
  txUsersOverride: null as FakeUser[] | null,
  inserted: [] as Record<string, unknown>[],
  nextId: 'admin-1',
  executeCalls: [] as unknown[],
}));

function resetState() {
  state.users = [];
  state.txUsersOverride = null;
  state.inserted = [];
  state.nextId = 'admin-1';
  state.executeCalls = [];
}

vi.mock('../db/client', () => {
  function selectFirst(rows: () => FakeUser[]) {
    return () => ({
      from: () => ({
        limit: () => Promise.resolve(rows()),
      }),
    });
  }

  return {
    db: {
      select: selectFirst(() => state.users),
      transaction: async (cb: (tx: unknown) => unknown) => {
        const tx = {
          execute: (q: unknown) => {
            state.executeCalls.push(q);
            return Promise.resolve();
          },
          select: selectFirst(() => state.txUsersOverride ?? state.users),
          insert: () => ({
            values: (vals: Record<string, unknown>) => ({
              returning: () => {
                state.inserted.push(vals);
                return Promise.resolve([{ id: state.nextId }]);
              },
            }),
          }),
        };
        return cb(tx);
      },
    },
  };
});

import { computeSetupCode, createFirstAdminUser, isSetupModeActive, verifySetupCode } from './bootstrap';

const ENV_KEYS = ['PASSWORD_AUTH', 'PROXY_AUTH'];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  resetState();
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('computeSetupCode', () => {
  it('is deterministic for the same secret', () => {
    const a = computeSetupCode('super-secret-value');
    const b = computeSetupCode('super-secret-value');
    expect(a).toBe(b);
  });

  it('differs across secrets', () => {
    const a = computeSetupCode('secret-one');
    const b = computeSetupCode('secret-two');
    expect(a).not.toBe(b);
  });

  it('has the XXXX-XXXX shape, uppercase, no ambiguous characters', () => {
    const code = computeSetupCode('another-secret');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(code).not.toMatch(/[01OI]/);
  });

  it('throws when the secret is empty', () => {
    expect(() => computeSetupCode('')).toThrow();
  });
});

describe('verifySetupCode', () => {
  const secret = 'auth-secret-for-tests';

  it('accepts the exact code computeSetupCode produces', () => {
    const code = computeSetupCode(secret);
    expect(verifySetupCode(code, secret)).toBe(true);
  });

  it('is tolerant of case and missing dashes (human-entered code)', () => {
    const code = computeSetupCode(secret);
    const messy = code.toLowerCase().replace('-', '');
    expect(verifySetupCode(messy, secret)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const code = computeSetupCode(secret);
    const wrong = code[0] === 'A' ? 'B' + code.slice(1) : 'A' + code.slice(1);
    expect(verifySetupCode(wrong, secret)).toBe(false);
  });

  it('rejects a code computed from a different secret', () => {
    const code = computeSetupCode('a-different-secret');
    expect(verifySetupCode(code, secret)).toBe(false);
  });

  it('rejects an empty candidate or an empty secret without throwing', () => {
    const code = computeSetupCode(secret);
    expect(verifySetupCode('', secret)).toBe(false);
    expect(verifySetupCode(code, '')).toBe(false);
  });
});

describe('isSetupModeActive', () => {
  it('is true with defaults (password auth on, proxy off) and no users', async () => {
    state.users = [];
    expect(await isSetupModeActive()).toBe(true);
  });

  it('is false once a user exists', async () => {
    state.users = [{ id: 'u1' }];
    expect(await isSetupModeActive()).toBe(false);
  });

  it('is false when proxy auth is enabled, regardless of user count', async () => {
    process.env.PROXY_AUTH = 'true';
    state.users = [];
    expect(await isSetupModeActive()).toBe(false);
  });

  it('is false when password auth is disabled', async () => {
    process.env.PASSWORD_AUTH = 'false';
    state.users = [];
    expect(await isSetupModeActive()).toBe(false);
  });
});

describe('createFirstAdminUser', () => {
  it('creates a confirmed admin under the advisory lock when no users exist', async () => {
    state.users = [];
    const result = await createFirstAdminUser({
      email: 'owner@example.com',
      passwordHash: 'hashed',
    });
    expect(result).toEqual({ ok: true, userId: 'admin-1' });
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      email: 'owner@example.com',
      passwordHash: 'hashed',
      role: 'admin',
    });
    expect(state.inserted[0].emailConfirmedAt).toBeInstanceOf(Date);
    // Took the advisory lock before checking/inserting.
    expect(state.executeCalls).toHaveLength(1);
  });

  it('loses the race cleanly when another request already created the first user', async () => {
    // Simulate: this call's SELECT (run after acquiring the lock) sees a row
    // that a concurrent, already-committed transaction inserted.
    state.txUsersOverride = [{ id: 'someone-else' }];
    const result = await createFirstAdminUser({
      email: 'late@example.com',
      passwordHash: 'hashed',
    });
    expect(result).toEqual({ ok: false, reason: 'users_exist' });
    expect(state.inserted).toHaveLength(0);
  });
});
