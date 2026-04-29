import { describe, expect, it } from 'vitest';
import { passwordResetEmail } from './templates';

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
});
