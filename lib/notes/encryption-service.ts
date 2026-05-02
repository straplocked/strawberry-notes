/**
 * Service-layer operations for the `user_encryption` row that backs the
 * Private Notes feature. The server is a dumb store for the wrapped Note
 * Master Key — it never sees the user's passphrase, recovery code, or
 * unwrapped key. Validation is structural only (does the wrap blob have the
 * right shape?); cryptographic correctness is the client's responsibility.
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { notes, userEncryption } from '../db/schema';

/**
 * Loose schema for the JSON-shaped wrap envelope. We don't decode the base64
 * fields here — that's the client's job at unwrap time. Validating shape +
 * non-empty strings is enough to refuse blatant garbage at the API edge.
 */
export const WrapBlobSchema = z.object({
  v: z.number().int().positive(),
  kdf: z.literal('PBKDF2-SHA256'),
  iters: z.number().int().min(1000).max(10_000_000),
  salt: z.string().min(1).max(2048),
  iv: z.string().min(1).max(64),
  ct: z.string().min(1).max(2048),
});

export type WrapBlobInput = z.infer<typeof WrapBlobSchema>;

export interface UserEncryptionMaterial {
  version: number;
  passphraseWrap: WrapBlobInput;
  recoveryWrap: WrapBlobInput;
  createdAt: string;
  updatedAt: string;
}

export class AlreadyConfiguredError extends Error {
  constructor() {
    super('private notes already configured for this user');
    this.name = 'AlreadyConfiguredError';
  }
}

export class NotConfiguredError extends Error {
  constructor() {
    super('private notes not configured for this user');
    this.name = 'NotConfiguredError';
  }
}

export class HasPrivateNotesError extends Error {
  constructor(public count: number) {
    super(`cannot disable: ${count} private note(s) still exist`);
    this.name = 'HasPrivateNotesError';
  }
}

/** Read the user's wrap blobs. Returns null when not configured. */
export async function getUserEncryptionMaterial(
  userId: string,
): Promise<UserEncryptionMaterial | null> {
  const [row] = await db
    .select()
    .from(userEncryption)
    .where(eq(userEncryption.userId, userId));
  if (!row) return null;
  return {
    version: row.version,
    passphraseWrap: row.passphraseWrap as WrapBlobInput,
    recoveryWrap: row.recoveryWrap as WrapBlobInput,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** First-time setup. Refuses when a row already exists. */
export async function setupUserEncryption(
  userId: string,
  passphraseWrap: WrapBlobInput,
  recoveryWrap: WrapBlobInput,
): Promise<UserEncryptionMaterial> {
  const existing = await getUserEncryptionMaterial(userId);
  if (existing) throw new AlreadyConfiguredError();
  const [row] = await db
    .insert(userEncryption)
    .values({
      userId,
      version: 1,
      passphraseWrap,
      recoveryWrap,
    })
    .returning();
  return {
    version: row.version,
    passphraseWrap: row.passphraseWrap as WrapBlobInput,
    recoveryWrap: row.recoveryWrap as WrapBlobInput,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Replace the passphrase-wrap. Used when the user changes their passphrase. */
export async function updatePassphraseWrap(
  userId: string,
  passphraseWrap: WrapBlobInput,
): Promise<void> {
  const updated = await db
    .update(userEncryption)
    .set({ passphraseWrap, updatedAt: new Date() })
    .where(eq(userEncryption.userId, userId))
    .returning({ userId: userEncryption.userId });
  if (updated.length === 0) throw new NotConfiguredError();
}

/** Replace the recovery-wrap. Used when the user regenerates their recovery code. */
export async function updateRecoveryWrap(
  userId: string,
  recoveryWrap: WrapBlobInput,
): Promise<void> {
  const updated = await db
    .update(userEncryption)
    .set({ recoveryWrap, updatedAt: new Date() })
    .where(eq(userEncryption.userId, userId))
    .returning({ userId: userEncryption.userId });
  if (updated.length === 0) throw new NotConfiguredError();
}

/**
 * Disable the feature. Refuses with {@link HasPrivateNotesError} when any
 * private notes still exist — the user must explicitly migrate them back to
 * plaintext (one by one, from the editor) before we drop the only material
 * that could ever decrypt them.
 */
export async function disableUserEncryption(userId: string): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notes)
    .where(and(eq(notes.userId, userId), isNotNull(notes.encryption)));
  if (count > 0) throw new HasPrivateNotesError(count);
  await db.delete(userEncryption).where(eq(userEncryption.userId, userId));
}

/** Cheap predicate, used by the disable route + the editor's "transition to plaintext" flow. */
export async function countPrivateNotes(userId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notes)
    .where(and(eq(notes.userId, userId), isNotNull(notes.encryption)));
  return count;
}
