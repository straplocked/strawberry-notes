import type { Metadata } from 'next';
import Link from 'next/link';
import { AppearanceSection } from '@/components/app/settings/AppearanceSection';
import { EmailPreferencesSection } from '@/components/app/settings/EmailPreferencesSection';
import { McpClientsSection } from '@/components/app/settings/McpClientsSection';
import { PrivateNotesSection } from '@/components/app/settings/PrivateNotesSection';
import { SecuritySection } from '@/components/app/settings/SecuritySection';
import { TagsSection } from '@/components/app/settings/TagsSection';
import { TokensSection } from '@/components/app/settings/TokensSection';
import { WebhooksSection } from '@/components/app/settings/WebhooksSection';
import { PRIVATE_NOTES_ENABLED } from '@/lib/private-notes/feature-flag';

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
      <AppearanceSection />
      <SecuritySection />
      {PRIVATE_NOTES_ENABLED && <PrivateNotesSection />}
      <TagsSection />
      <TokensSection />
      <WebhooksSection />
      <EmailPreferencesSection />
      <McpClientsSection />
    </main>
  );
}
