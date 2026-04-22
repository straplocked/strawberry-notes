import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/client', () => ({ db: {} }));

import { verifyBearerToken } from './token';

describe('verifyBearerToken — early-return paths (no DB)', () => {
  it('returns null for empty input', async () => {
    expect(await verifyBearerToken('')).toBeNull();
  });

  it('returns null for input without the snb_ prefix', async () => {
    expect(await verifyBearerToken('pk_abc123')).toBeNull();
    expect(await verifyBearerToken('abc123')).toBeNull();
  });
});
