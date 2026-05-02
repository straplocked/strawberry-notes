import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db/client';
import { users } from './db/schema';
import { isEmailConfirmationRequired } from './auth/signup-policy';

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      const authed = !!session?.user;
      // Gate the app shell; allow everything else (auth pages, public API, static).
      if (pathname.startsWith('/notes')) return authed;
      return true;
    },
  },
});

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
  interface User {
    id: string;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
  }
}
