import { describe, it, expect, vi, beforeEach } from 'vitest';

// `verifyBearerToken` joins `api_tokens` to `users` so it can reject a token
// belonging to a disabled account — see the doc comment in ./token.ts for
// why a long-lived API token needs its own disabled-check independent of
// session/credentials-provider gating. The mock below models that single
// `select().from().innerJoin().where()` query plus the fire-and-forget
// `lastUsedAt` update.
const state = {
  /** Row returned by the mocked SELECT; null simulates "no matching token". */
  row: null as { id: string; userId: string; disabledAt: Date | null } | null,
};

vi.mock('../db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => (state.row ? [state.row] : []),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  },
}));

import { verifyBearerToken } from './token';

beforeEach(() => {
  state.row = null;
});

describe('verifyBearerToken — early-return paths (no DB)', () => {
  it('returns null for empty input', async () => {
    expect(await verifyBearerToken('')).toBeNull();
  });

  it('returns null for input without the snb_ prefix', async () => {
    expect(await verifyBearerToken('pk_abc123')).toBeNull();
    expect(await verifyBearerToken('abc123')).toBeNull();
  });
});

describe('verifyBearerToken — disabled-user rejection (task 04 PR A)', () => {
  it('accepts a valid token for an enabled user', async () => {
    state.row = { id: 'token-1', userId: 'user-1', disabledAt: null };
    const result = await verifyBearerToken(`snb_${'a'.repeat(64)}`);
    expect(result).toEqual({ userId: 'user-1', tokenId: 'token-1' });
  });

  it('rejects a token whose owning user has been disabled', async () => {
    // Same row the "enabled" case returns, except the admin has since called
    // setUserDisabled(true) (lib/auth/user-admin.ts). A revoked-token check
    // alone doesn't cover this: the token itself is still valid and
    // unrevoked, but the account it belongs to should no longer be able to
    // act through it — same intent as the credentials provider's
    // `if (user.disabledAt) return null` (lib/auth.ts) and proxy mode's
    // per-request re-check (lib/auth/require.ts).
    state.row = { id: 'token-1', userId: 'user-1', disabledAt: new Date('2026-01-01') };
    const result = await verifyBearerToken(`snb_${'a'.repeat(64)}`);
    expect(result).toBeNull();
  });

  it('returns null when no token row matches at all', async () => {
    state.row = null;
    const result = await verifyBearerToken(`snb_${'a'.repeat(64)}`);
    expect(result).toBeNull();
  });
});
