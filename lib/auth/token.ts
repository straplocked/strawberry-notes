import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { apiTokens } from '../db/schema';

const TOKEN_PREFIX = 'snb_';
const TOKEN_BYTES = 32;
const DISPLAY_PREFIX_LEN = 8;

export interface IssuedToken {
  id: string;
  token: string;
  prefix: string;
}

export interface TokenSummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function issueToken(userId: string, name: string): Promise<IssuedToken> {
  const body = randomBytes(TOKEN_BYTES).toString('hex');
  const token = `${TOKEN_PREFIX}${body}`;
  const prefix = token.slice(0, TOKEN_PREFIX.length + DISPLAY_PREFIX_LEN);
  const tokenHash = hash(token);
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name: name.trim().slice(0, 80) || 'token', prefix, tokenHash })
    .returning({ id: apiTokens.id });
  return { id: row.id, token, prefix };
}

export async function verifyBearerToken(
  raw: string,
): Promise<{ userId: string; tokenId: string } | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hash(raw)), isNull(apiTokens.revokedAt)));
  if (!row) return null;
  // Fire-and-forget: update lastUsedAt. Ignore errors.
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});
  return { userId: row.userId, tokenId: row.id };
}

export async function listTokensForUser(userId: string): Promise<TokenSummary[]> {
  const rows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function revokeToken(userId: string, tokenId: string): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}
