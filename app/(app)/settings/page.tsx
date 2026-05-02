import type { Metadata } from 'next';
import Link from 'next/link';
import { EmailPreferencesSection } from '@/components/app/settings/EmailPreferencesSection';
import { McpClientsSection } from '@/components/app/settings/McpClientsSection';
import { TagsSection } from '@/components/app/settings/TagsSection';
import { TokensSection } from '@/components/app/settings/TokensSection';
import { WebhooksSection } from '@/components/app/settings/WebhooksSection';

export const metadata: Metadata = { title: 'Settings — Strawberry Notes' };

export default function SettingsPage() {
  return (
    <main
      style={{
        maxWidth: 720,
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
          Settings
        </h1>
      </header>
      <TagsSection />
      <TokensSection />
      <WebhooksSection />
      <EmailPreferencesSection />
      <McpClientsSection />
    </main>
  );
}
