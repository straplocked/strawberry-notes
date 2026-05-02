import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEffectiveSession } from '@/lib/auth/require';
import { AdminUsersClient } from '@/components/app/admin/AdminUsersClient';

export const metadata: Metadata = { title: 'Admin · Users — Strawberry Notes' };

export default async function AdminUsersPage() {
  const session = await getEffectiveSession();
  // 404 (not 403) for non-admins — don't advertise the route's existence to
  // signed-in regular users. The middleware/authorize callback also blocks
  // unauthed access; this is belt-and-braces server-side.
  if (session?.user?.role !== 'admin') notFound();

  return (
    <main
      style={{
        maxWidth: 920,
        margin: '0 auto',
        padding: '40px 24px 80px',
        color: 'var(--ink)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <Link
          href="/notes"
          style={{
            color: 'var(--ink-3)',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            textDecoration: 'none',
          }}
        >
          ← Back to notes
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            marginTop: 8,
          }}
        >
          Users
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
          Manage everyone with an account on this instance. The first user is
          your bootstrap admin; promote others as needed.
        </p>
      </header>
      <AdminUsersClient currentUserId={session.user.id} />
    </main>
  );
}
