import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- DB fake ---------------------------------------------------------------

interface InsertCall {
  table: 'users' | 'folders';
  values: Record<string, unknown>;
}

interface UpdateCall {
  table: 'users';
  set: Record<string, unknown>;
}

const state = {
  inserts: [] as InsertCall[],
  updates: [] as UpdateCall[],
  insertResult: [] as Array<{ id: string; email?: string }>,
  updateResult: [] as Array<{ id: string }>,
  insertThrows: null as Error | null,
};

function reset() {
  state.inserts = [];
  state.updates = [];
  state.insertResult = [];
  state.updateResult = [];
  state.insertThrows = null;
}

vi.mock('../db/client', () => {
  const insertChain = (table: 'users' | 'folders') => ({
    values: (vals: Record<string, unknown>) => {
      state.inserts.push({ table, values: vals });
      if (state.insertThrows) {
        const err = state.insertThrows;
        return {
          returning: () => Promise.reject(err),
        };
      }
      return {
        returning: () => Promise.resolve(state.insertResult),
      };
    },
  });

  const updateChain = (table: 'users') => ({
    set: (vals: Record<string, unknown>) => {
      state.updates.push({ table, set: vals });
      return {
        where: () => ({
          returning: () => Promise.resolve(state.updateResult),
        }),
      };
    },
  });

  return {
    db: {
      insert: (tableRef: { _: { name: string } } | unknown) => {
        // drizzle table refs aren't easily introspectable here; we infer from
        // call order — first insert in createUser is users, second is folders.
        // For resetPassword the path uses `update`, not insert.
        const seenInsertsBeforeThis = state.inserts.length;
        const inferred: 'users' | 'folders' = seenInsertsBeforeThis === 0 ? 'users' : 'folders';
        void tableRef;
        return insertChain(inferred);
      },
      update: () => updateChain('users'),
    },
  };
});

import { createUser, generatePassword, resetPassword, UserAdminError } from './user-admin';

beforeEach(() => {
  reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createUser', () => {
  it('inserts a user, lowercases the email, and seeds a Journal folder', async () => {
    state.insertResult = [{ id: 'u-1', email: 'alice@example.com' }];
    const result = await createUser('Alice@Example.com', 'hunter2hunter');
    expect(result).toEqual({ id: 'u-1', email: 'alice@example.com' });

    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0].table).toBe('users');
    expect(state.inserts[0].values.email).toBe('alice@example.com');
    // Bcrypt hash, not the raw password.
    expect(state.inserts[0].values.passwordHash).not.toBe('hunter2hunter');
    expect(String(state.inserts[0].values.passwordHash).startsWith('$2')).toBe(true);

    expect(state.inserts[1].table).toBe('folders');
    expect(state.inserts[1].values).toMatchObject({
      userId: 'u-1',
      name: 'Journal',
      position: 0,
    });
  });

  it('rejects an invalid email', async () => {
    await expect(createUser('not-an-email', 'hunter2hunter')).rejects.toThrowError(UserAdminError);
    await expect(createUser('not-an-email', 'hunter2hunter')).rejects.toMatchObject({
      code: 'invalid_email',
    });
    expect(state.inserts).toHaveLength(0);
  });

  it('rejects a too-short password', async () => {
    await expect(createUser('alice@example.com', 'short')).rejects.toMatchObject({
      code: 'password_too_short',
    });
  });

  it('maps duplicate-key errors to email_taken', async () => {
    state.insertThrows = new Error('duplicate key value violates unique constraint');
    await expect(createUser('alice@example.com', 'hunter2hunter')).rejects.toMatchObject({
      code: 'email_taken',
    });
  });
});

describe('resetPassword', () => {
  it('updates the password hash and returns the user id', async () => {
    state.updateResult = [{ id: 'u-2' }];
    const out = await resetPassword('Bob@Example.com', 'newpassword1');
    expect(out).toEqual({ id: 'u-2' });
    expect(state.updates).toHaveLength(1);
    expect(String(state.updates[0].set.passwordHash).startsWith('$2')).toBe(true);
  });

  it('throws not_found when no row matches', async () => {
    state.updateResult = [];
    await expect(resetPassword('ghost@example.com', 'newpassword1')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('rejects a too-short password before touching the DB', async () => {
    await expect(resetPassword('bob@example.com', 'short')).rejects.toMatchObject({
      code: 'password_too_short',
    });
    expect(state.updates).toHaveLength(0);
  });
});

describe('generatePassword', () => {
  it('produces ASCII strings of at least the floor length', () => {
    for (let i = 0; i < 10; i++) {
      const pw = generatePassword();
      expect(pw.length).toBeGreaterThanOrEqual(8);
      expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('produces distinct values across calls', () => {
    const set = new Set(Array.from({ length: 20 }, () => generatePassword()));
    expect(set.size).toBe(20);
  });
});
