import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db/client';
import { users } from './db/schema';
import { isEmailConfirmationRequired } from './auth/signup-policy';

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type UserRole = 'user' | 'admin';

/** First-sign-in bootstrap: if the table has no admin yet, promote this user.
 * Covers the fresh-install case where the migration's UPDATE no-oped because
 * no users existed yet. Idempotent — once any admin exists, the WHERE NOT
 * EXISTS clause makes it a no-op. */
async function maybeBootstrapAdmin(userId: string): Promise<UserRole> {
  const [row] = await db
    .update(users)
    .set({ role: 'admin' })
    .where(
      and(
        eq(users.id, userId),
        sql`NOT EXISTS (SELECT 1 FROM ${users} WHERE ${users.role} = 'admin' AND ${users.id} <> ${userId})`,
      ),
    )
    .returning({ role: users.role });
  return (row?.role as UserRole) ?? 'user';
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  // Self-hosted: trust the inbound Host header so callbacks work whether
  // the operator pinned AUTH_URL or left it for runtime auto-derive (LAN
  // IP, direct hostname, X-Forwarded-Host from a proxy).
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
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
        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        // When `REQUIRE_EMAIL_CONFIRMATION` is set, sign-in is blocked
        // until the user clicks the confirmation link emailed at signup.
        // Returning null here surfaces as the same generic "wrong email
        // or password" the UI shows on bad creds — we don't leak whether
        // the address exists or whether confirmation is the gate.
        if (isEmailConfirmationRequired() && !user.emailConfirmedAt) {
          return null;
        }
        // Disabled accounts can't sign in. Same generic null so the UI
        // doesn't differentiate disabled-vs-bad-creds to outsiders.
        if (user.disabledAt) return null;
        // First-sign-in bootstrap admin (no-op once any admin exists).
        const role = user.role === 'admin' ? 'admin' : await maybeBootstrapAdmin(user.id);
        return { id: user.id, email: user.email, role };
      },
    }),
  ],
  callbacks: {
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
      const authed = !!session?.user;
      const isAdmin = session?.user?.role === 'admin';
      if (pathname.startsWith('/admin')) return authed && isAdmin;
      // Gate the app shell; allow everything else (auth pages, public API, static).
      if (pathname.startsWith('/notes')) return authed;
      return true;
    },
  },
});

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

