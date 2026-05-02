/**
 * Render every transactional email template to disk for visual review —
 * no SMTP, no Docker, no Mailpit round-trip. Writes one .html + .txt per
 * sample to `<outDir>/`, plus an `index.html` that links each preview.
 *
 * Usage:
 *   npm run email:preview                 # writes to /tmp/email-preview
 *   npm run email:preview -- ./my-out     # custom output dir
 *
 * Open the printed `index.html` path in your browser. Iterate on
 * `lib/email/templates.ts` and re-run.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  emailConfirmationEmail,
  passwordChangedEmail,
  passwordResetEmail,
  tokenCreatedEmail,
  webhookCreatedEmail,
  webhookDeadLetterEmail,
} from '../lib/email/templates';
import type { EmailMessage } from '../lib/email/client';

const RESET_URL =
  'https://notes.strawberry.app/reset-password?token=srt_a3f1d8e7b2c4956fd0c1e9a8b7d6c5f4';
const CONFIRM_URL = 'https://notes.strawberry.app/confirm-email?token=ect_b3a2c1d0e9f8a7b6c5d4e3f2a1b0c9d8';
const LOGIN_URL = 'https://notes.strawberry.app/login';
const SETTINGS_TOKENS = 'https://notes.strawberry.app/settings#tokens';
const SETTINGS_WEBHOOKS = 'https://notes.strawberry.app/settings#webhooks';
const FIXED_DATE = new Date('2026-05-01T20:00:00Z');

const samples: { name: string; subtitle: string; msg: EmailMessage }[] = [
  {
    name: 'password-reset',
    subtitle: '1-hour expiry — recommended default',
    msg: passwordResetEmail({
      to: 'alice@example.com',
      resetUrl: RESET_URL,
      expiresInHours: 1,
    }),
  },
  {
    name: 'password-reset-24h',
    subtitle: '24-hour expiry — pluralised',
    msg: passwordResetEmail({
      to: 'alice@example.com',
      resetUrl: RESET_URL,
      expiresInHours: 24,
    }),
  },
  {
    name: 'password-reset-acme',
    subtitle: 'self-hosted re-brand (custom appName)',
    msg: passwordResetEmail({
      to: 'alice@acme.io',
      resetUrl: RESET_URL,
      expiresInHours: 1,
      appName: 'Acme Notes',
    }),
  },
  {
    name: 'email-confirmation',
    subtitle: 'signup confirmation — 24h expiry',
    msg: emailConfirmationEmail({
      to: 'alice@example.com',
      confirmUrl: CONFIRM_URL,
      expiresInHours: 24,
    }),
  },
  {
    name: 'password-changed',
    subtitle: 'self-service reset — security notice',
    msg: passwordChangedEmail({
      to: 'alice@example.com',
      changedAt: FIXED_DATE,
      loginUrl: LOGIN_URL,
      source: 'self-service reset',
    }),
  },
  {
    name: 'token-created',
    subtitle: 'new personal access token',
    msg: tokenCreatedEmail({
      to: 'alice@example.com',
      tokenName: 'Claude Desktop',
      tokenPrefix: 'snb_abcd1234',
      createdAt: FIXED_DATE,
      tokensUrl: SETTINGS_TOKENS,
    }),
  },
  {
    name: 'webhook-created',
    subtitle: 'new outbound webhook',
    msg: webhookCreatedEmail({
      to: 'alice@example.com',
      webhookName: 'n8n notes pipeline',
      webhookUrl: 'https://hooks.example.com/n8n/strawberry',
      events: ['note.created', 'note.tagged'],
      createdAt: FIXED_DATE,
      webhooksUrl: SETTINGS_WEBHOOKS,
    }),
  },
  {
    name: 'webhook-dead-letter',
    subtitle: 'webhook auto-disabled after repeated failures',
    msg: webhookDeadLetterEmail({
      to: 'alice@example.com',
      webhookName: 'n8n notes pipeline',
      webhookUrl: 'https://hooks.example.com/n8n/strawberry',
      consecutiveFailures: 5,
      lastError: 'HTTP 503 Service Unavailable',
      webhooksUrl: SETTINGS_WEBHOOKS,
    }),
  },
];

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrapHtml(name: string, msg: EmailMessage): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escHtml(name)} — ${escHtml(msg.subject)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;">
${msg.html ?? '<p>No HTML body.</p>'}
</body>
</html>`;
}

function indexHtml(outDir: string, items: typeof samples): string {
  const rows = items
    .map(
      (s) =>
        `<li><a href="${escHtml(s.name)}.html"><strong>${escHtml(s.name)}</strong></a> — ${escHtml(s.subtitle)} &nbsp;<small><a href="${escHtml(s.name)}.txt">plain text</a></small></li>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Strawberry Notes — email previews</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px auto; max-width: 720px; color: #1e110f; background: #f4ece4; padding: 0 16px; }
  h1 { font-family: 'Bricolage Grotesque', system-ui, sans-serif; }
  ul { line-height: 2; padding-left: 18px; }
  a { color: #b02537; }
  small a { color: #7a5a52; }
  code { background: #fbf3ec; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>
<h1>🍓 Strawberry Notes — email previews</h1>
<p>Rendered to <code>${escHtml(outDir)}</code>. Open each file in any modern browser.</p>
<ul>
${rows}
</ul>
<p><small>Edit <code>lib/email/templates.ts</code> and re-run <code>npm run email:preview</code> to refresh.</small></p>
</body>
</html>`;
}

const outArg = process.argv[2];
const outDir = resolve(outArg ?? '/tmp/email-preview');
mkdirSync(outDir, { recursive: true });

for (const s of samples) {
  writeFileSync(`${outDir}/${s.name}.html`, wrapHtml(s.name, s.msg));
  writeFileSync(`${outDir}/${s.name}.txt`, s.msg.text);
}
writeFileSync(`${outDir}/index.html`, indexHtml(outDir, samples));

console.log(`[email:preview] wrote ${samples.length} samples to ${outDir}`);
console.log(`[email:preview] open file://${outDir}/index.html`);
