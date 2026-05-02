import { describe, expect, it } from 'vitest';
import {
  emailConfirmationEmail,
  passwordChangedEmail,
  passwordResetEmail,
  tokenCreatedEmail,
  webhookCreatedEmail,
  webhookDeadLetterEmail,
} from './templates';

describe('passwordResetEmail', () => {
  const base = {
    to: 'alice@example.com',
    resetUrl: 'https://notes.example.com/reset-password?token=abc',
    expiresInHours: 1,
  };

  it('builds a sane subject + plain text + html', () => {
    const m = passwordResetEmail(base);
    expect(m.to).toBe('alice@example.com');
    expect(m.subject).toMatch(/Reset your .* password/);
    expect(m.text).toContain('https://notes.example.com/reset-password?token=abc');
    expect(m.text).toContain('1 hour');
    expect(m.html).toContain('<a href="https://notes.example.com/reset-password?token=abc"');
  });

  it('pluralises "hour" past 1', () => {
    const m = passwordResetEmail({ ...base, expiresInHours: 24 });
    expect(m.text).toContain('24 hours');
  });

  it('uses a custom appName when provided', () => {
    const m = passwordResetEmail({ ...base, appName: 'Acme Notes' });
    expect(m.subject).toBe('Reset your Acme Notes password');
    expect(m.text).toContain('Acme Notes');
  });

  it('escapes HTML in the link / app name to prevent injection', () => {
    const m = passwordResetEmail({
      ...base,
      resetUrl: 'https://x/reset?token=<script>',
      appName: '<b>Bad</b>',
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<b>Bad</b>');
    expect(m.html).toContain('&lt;script&gt;');
  });

  it('renders the branded shell — preview text, brand colour, CTA, footer slug', () => {
    const m = passwordResetEmail(base);
    // Hidden preheader is present so Gmail / Apple Mail can surface it
    expect(m.html).toContain('Reset your Strawberry Notes password — link expires in 1 hour.');
    // Berry brand colour (Variant A primary) is in the CTA + plain-link fallback
    expect(m.html).toMatch(/background-color:#e33d4e/);
    expect(m.html).toContain('#b02537');
    // CTA is a real anchor pointing at the reset URL
    expect(m.html).toMatch(
      /<a href="https:\/\/notes\.example\.com\/reset-password\?token=abc"[^>]*>Choose a new password<\/a>/,
    );
    // The branded shell carries the wordmark + a security caption + a footer slug
    expect(m.html).toContain('Strawberry Notes');
    expect(m.html).toContain('Account · Security');
    expect(m.html).toContain('strawberrynotes.app');
  });

  it('keeps a hostile appName escaped inside the branded chrome', () => {
    const m = passwordResetEmail({ ...base, appName: '<b>Bad</b>' });
    // Header wordmark, body greeting, and footer slug all flow through esc()
    expect(m.html).not.toContain('<b>Bad</b>');
    expect(m.html).toContain('&lt;b&gt;Bad&lt;/b&gt;');
    // Footer slug stays escaped too (lowercased + spaces stripped before esc)
    expect(m.html).not.toMatch(/Sent from <b>bad<\/b>\.app/);
    expect(m.html).toContain('&lt;b&gt;bad&lt;/b&gt;.app');
  });
});

describe('emailConfirmationEmail', () => {
  it('carries the confirm URL + expiry', () => {
    const m = emailConfirmationEmail({
      to: 'a@b.com',
      confirmUrl: 'https://x/confirm?token=z',
      expiresInHours: 24,
    });
    expect(m.subject).toMatch(/Confirm your email/);
    expect(m.text).toContain('https://x/confirm?token=z');
    expect(m.text).toContain('24 hours');
    expect(m.html).toContain('<a href="https://x/confirm?token=z"');
  });
});

describe('passwordChangedEmail', () => {
  const at = new Date('2026-05-01T20:00:00Z');
  const base = {
    to: 'a@b.com',
    changedAt: at,
    loginUrl: 'https://notes.example.com/login',
    source: 'self-service reset',
  };

  it('reports source + timestamp + login link', () => {
    const m = passwordChangedEmail(base);
    expect(m.subject).toMatch(/password was changed/);
    expect(m.text).toContain('self-service reset');
    expect(m.text).toContain('2026-05-01T20:00:00.000Z');
    expect(m.text).toContain('https://notes.example.com/login');
    expect(m.html).toContain('<a href="https://notes.example.com/login"');
  });

  it('escapes a hostile source string', () => {
    const m = passwordChangedEmail({ ...base, source: '<img src=x onerror=alert(1)>' });
    expect(m.html).not.toContain('<img');
    expect(m.html).toContain('&lt;img');
  });
});

describe('tokenCreatedEmail', () => {
  it('shows the token name + prefix + revoke link', () => {
    const m = tokenCreatedEmail({
      to: 'a@b.com',
      tokenName: 'Claude Desktop',
      tokenPrefix: 'snb_abcd1234',
      createdAt: new Date('2026-05-01T20:00:00Z'),
      tokensUrl: 'https://notes.example.com/settings#tokens',
    });
    expect(m.subject).toMatch(/New personal access token/);
    expect(m.text).toContain('Claude Desktop');
    expect(m.text).toContain('snb_abcd1234');
    expect(m.text).toContain('https://notes.example.com/settings#tokens');
    expect(m.html).toContain('<code>snb_abcd1234');
  });
});

describe('webhookCreatedEmail', () => {
  it('lists name / URL / events', () => {
    const m = webhookCreatedEmail({
      to: 'a@b.com',
      webhookName: 'n8n',
      webhookUrl: 'https://hooks.example.com/x',
      events: ['note.created', 'note.tagged'],
      createdAt: new Date('2026-05-01T20:00:00Z'),
      webhooksUrl: 'https://notes.example.com/settings#webhooks',
    });
    expect(m.subject).toMatch(/New webhook/);
    expect(m.text).toContain('n8n');
    expect(m.text).toContain('https://hooks.example.com/x');
    expect(m.text).toContain('note.created, note.tagged');
  });

  it('handles an empty events array gracefully', () => {
    const m = webhookCreatedEmail({
      to: 'a@b.com',
      webhookName: 'silent',
      webhookUrl: 'https://x',
      events: [],
      createdAt: new Date(),
      webhooksUrl: 'https://x/settings',
    });
    expect(m.text).toContain('(none)');
  });
});

describe('webhookDeadLetterEmail', () => {
  it('reports the failure count + last error + re-enable link', () => {
    const m = webhookDeadLetterEmail({
      to: 'a@b.com',
      webhookName: 'n8n',
      webhookUrl: 'https://hooks.example.com/x',
      consecutiveFailures: 5,
      lastError: 'HTTP 503',
      webhooksUrl: 'https://notes.example.com/settings#webhooks',
    });
    expect(m.subject).toContain('5 consecutive failures');
    expect(m.text).toContain('HTTP 503');
    expect(m.text).toContain('5 consecutive attempts');
    expect(m.html).toContain('<a href="https://notes.example.com/settings#webhooks"');
  });
});
