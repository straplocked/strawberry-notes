import NextAuth, { type DefaultSession, type NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { db } from './db/client';
import { users } from './db/schema';
import type { RecoveryCodeRecord } from './auth/totp';
import { isEmailConfirmationRequired } from './auth/signup-policy';
import { ensureAdminBootstrap } from './auth/bootstrap';
import {
  getOidcClientId,
  getOidcClientSecret,
  getOidcIssuer,
  getOidcLabel,
  isOidcEnabled,
  isPasswordAuthEnabled,
  isProxyAuthEnabled,
  isTotpEnabled,
} from './auth/mode';
import {
  issueTicket,
  verifyTicket,
  MFA_TICKET_COOKIE,
  MFA_PENDING_COOKIE,
  MFA_TICKET_TTL_MS,
} from './auth/mfa-ticket';
import { findRecoveryCodeIndex, verifyTotpCode } from './auth/totp';
import { resolveOrLinkOidcUser } from './auth/oidc-link';

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const TotpSchema = z.object({
  code: z.string().min(1),
});

export type UserRole = 'user' | 'admin';

function buildProviders(): Provider[] {
  const providers: Provider[] = [];

  if (isPasswordAuthEnabled()) {
    providers.push(
      Credentials({
        id: 'credentials',
        name: 'Email and password',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(raw) {
          const parsed = CredentialsSchema.safeParse(raw);
          if (!parsed.success) return null;
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, parsed.data.email.toLowerCase()));
          if (!user) return null;
          // OIDC-only / proxy-only users have no local password — reject.
          if (!user.passwordHash) return null;
          const ok = await compare(parsed.data.password, user.passwordHash);
          if (!ok) return null;
          if (isEmailConfirmationRequired() && !user.emailConfirmedAt) return null;
          if (user.disabledAt) return null;

          // TOTP-enrolled users don't get a session here. We mint a signed
          // ticket cookie; the login form switches to the TOTP screen and
          // calls signIn('totp', { ticket, code }) — which hits the second
          // provider below. Returning null surfaces as a normal failed
          // sign-in to Auth.js (it redirects to /login?error=...). The
          // form reads the ticket cookie and switches modes accordingly.
          if (user.totpSecret) {
            const { ticket, expiresAt } = issueTicket(user.id);
            try {
              const cookieJar = await cookies();
              const maxAge = Math.floor(MFA_TICKET_TTL_MS / 1000);
              cookieJar.set(MFA_TICKET_COOKIE, ticket, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                expires: expiresAt,
                maxAge,
              });
              // Companion presence flag (not httpOnly) so the login form's JS
              // can switch to the TOTP screen without leaking the ticket
              // itself to scripts.
              cookieJar.set(MFA_PENDING_COOKIE, '1', {
                httpOnly: false,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                expires: expiresAt,
                maxAge,
              });
            } catch {
              // cookies() can throw if called outside a request context (test
              // harness). The login flow will surface a normal failure.
            }
            return null;
          }

          const role = user.role === 'admin' ? 'admin' : await ensureAdminBootstrap(user.id);
          return { id: user.id, email: user.email, role };
        },
      }),
    );

    if (isTotpEnabled()) {
      providers.push(
        Credentials({
          id: 'totp',
          name: 'TOTP code',
          credentials: {
            code: { label: 'Code', type: 'text' },
          },
          async authorize(raw) {
            const parsed = TotpSchema.safeParse(raw);
            if (!parsed.success) return null;
            // Read the signed ticket from the httpOnly cookie. The login
            // form never sees it — the credentials provider that just
            // verified the password set it server-side.
            let rawTicket: string | undefined;
            try {
              const jar = await cookies();
              rawTicket = jar.get(MFA_TICKET_COOKIE)?.value;
            } catch {}
            if (!rawTicket) return null;
            const verdict = verifyTicket(rawTicket);
            if (!verdict.ok) return null;
            const [user] = await db.select().from(users).where(eq(users.id, verdict.userId));
            if (!user || user.disabledAt) return null;
            if (!user.totpSecret) return null;

            const cleaned = parsed.data.code.replace(/\s+/g, '');
            // Try TOTP first (the common case).
            if (/^\d{6}$/.test(cleaned)) {
              if (await verifyTotpCode(user.totpSecret, cleaned)) {
                await clearMfaTicketCookie();
                const role =
                  user.role === 'admin' ? 'admin' : await ensureAdminBootstrap(user.id);
                return { id: user.id, email: user.email, role };
              }
              return null;
            }

            // Otherwise check the recovery codes — single-use, mark consumed.
            const records = (user.totpRecoveryCodes as RecoveryCodeRecord[] | null) ?? [];
            const idx = await findRecoveryCodeIndex(records, cleaned);
            if (idx < 0) return null;
            const updated = records.map((r, i) =>
              i === idx ? { ...r, usedAt: new Date().toISOString() } : r,
            );
            await db
              .update(users)
              .set({ totpRecoveryCodes: updated })
              .where(eq(users.id, user.id));
            await clearMfaTicketCookie();
            const role = user.role === 'admin' ? 'admin' : await ensureAdminBootstrap(user.id);
            return { id: user.id, email: user.email, role };
          },
        }),
      );
    }
  }

  if (isOidcEnabled()) {
    const issuer = getOidcIssuer();
    const clientId = getOidcClientId();
    const clientSecret = getOidcClientSecret();
    if (issuer && clientId && clientSecret) {
      providers.push({
        id: 'oidc',
        name: getOidcLabel(),
        type: 'oidc',
        issuer,
        clientId,
        clientSecret,
        // Pull email_verified through; default OIDC scopes already include
        // openid+profile+email.
        authorization: { params: { scope: 'openid email profile' } },
      } as unknown as Provider);
    }
  }

  return providers;
}

async function clearMfaTicketCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(MFA_TICKET_COOKIE);
    jar.delete(MFA_PENDING_COOKIE);
  } catch {}
}

const config: NextAuthConfig = {
  // Self-hosted: trust the inbound Host header so callbacks work whether
  // the operator pinned AUTH_URL or left it for runtime auto-derive (LAN
  // IP, direct hostname, X-Forwarded-Host from a proxy).
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: buildProviders(),
  callbacks: {
    async signIn({ user, account, profile }) {
      // Credentials providers handle their own resolution. Only run linking
      // logic for the OIDC provider.
      if (!account || account.provider !== 'oidc') return true;
      const result = await resolveOrLinkOidcUser({
        provider: 'oidc',
        subject: account.providerAccountId ?? (profile?.sub as string | undefined) ?? '',
        email: (profile?.email as string | undefined) ?? user.email ?? null,
        emailVerified: (profile as { email_verified?: boolean } | undefined)?.email_verified,
      });
      if (!result.ok) return false;
      // Mutate the user shape so the JWT callback picks up the local IDs.
      // next-auth carries this user object straight into the JWT.
      (user as { id?: string; role?: UserRole }).id = result.userId;
      (user as { id?: string; role?: UserRole }).role = result.role;
      user.email = result.email;
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      if (user?.role) token.role = user.role;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as UserRole) ?? 'user';
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      // In proxy mode, gating is done in app/(app)/layout.tsx and in
      // requireUserId via getEffectiveSession() — defer here so Auth.js
      // doesn't redirect to /login (which we hide in proxy mode).
      if (isProxyAuthEnabled()) return true;
      const authed = !!session?.user;
      const isAdmin = session?.user?.role === 'admin';
      if (pathname.startsWith('/admin')) return authed && isAdmin;
      // Gate the app shell; allow everything else (auth pages, public API, static).
      if (pathname.startsWith('/notes')) return authed;
      return true;
    },
  },
};

export const { auth, handlers, signIn, signOut } = NextAuth(config);

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: UserRole } & DefaultSession['user'];
  }
  interface User {
    id: string;
    role?: UserRole;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
    role?: UserRole;
  }
}
