import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { apiTokens, users } from '../db/schema';
import { notifyTokenCreated } from '../email/notifications';

const TOKEN_PREFIX = 'snb_';
const TOKEN_BYTES = 32;
const DISPLAY_PREFIX_LEN = 8;

/**
 * 'write' carries the same full access a token has always had. 'read' gets
 * no write MCP tools (lib/mcp/server.ts), 403s on POST /api/notes/import,
 * and is otherwise unchanged — same read access, same Private Notes
 * exclusion. See docs/technical/mcp.md.
 */
export type TokenScope = 'read' | 'write';

export interface IssuedToken {
  id: string;
  token: string;
  prefix: string;
  scope: TokenScope;
}

export interface TokenSummary {
  id: string;
  name: string;
  prefix: string;
  scope: TokenScope;
  lastUsedAt: string | null;
  createdAt: string;
}

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface IssueTokenOpts {
  /** Base URL for the notification email link; usually `getPublicBaseUrl(req)`. */
  baseUrl?: string;
}

export async function issueToken(
  userId: string,
  name: string,
  scope: TokenScope,
  opts: IssueTokenOpts = {},
): Promise<IssuedToken> {
  const body = randomBytes(TOKEN_BYTES).toString('hex');
  const token = `${TOKEN_PREFIX}${body}`;
  const prefix = token.slice(0, TOKEN_PREFIX.length + DISPLAY_PREFIX_LEN);
  const tokenHash = hash(token);
  const cleanName = name.trim().slice(0, 80) || 'token';
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name: cleanName, prefix, tokenHash, scope })
    .returning({ id: apiTokens.id });
  void notifyTokenCreated(userId, {
    tokenName: cleanName,
    tokenPrefix: prefix,
    baseUrl: opts.baseUrl,
  });
  return { id: row.id, token, prefix, scope };
}

export async function verifyBearerToken(
  raw: string,
): Promise<{ userId: string; tokenId: string; scope: TokenScope } | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
  // Join `users` and reject when the account is disabled. An admin disabling
  // a user (`lib/auth/user-admin.ts`) is meant to immediately cut off *every*
  // way in — the credentials provider already checks `disabledAt` on every
  // sign-in (`lib/auth.ts`) and proxy-mode re-checks it per request
  // (`lib/auth/require.ts`) — but a long-lived API token issued before the
  // account was disabled has no session to expire; without this check it
  // would keep working indefinitely.
  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      scope: apiTokens.scope,
      disabledAt: users.disabledAt,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, hash(raw)), isNull(apiTokens.revokedAt)));
  if (!row || row.disabledAt) return null;
  // Fire-and-forget: update lastUsedAt. Ignore errors.
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});
  return { userId: row.userId, tokenId: row.id, scope: (row.scope as TokenScope) ?? 'write' };
}

export async function listTokensForUser(userId: string): Promise<TokenSummary[]> {
  const rows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scope: apiTokens.scope,
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
    scope: (r.scope as TokenScope) ?? 'write',
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function revokeToken(userId: string, tokenId: string): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)),
    )
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}
