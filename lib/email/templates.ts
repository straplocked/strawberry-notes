/**
 * Email content. Keep these intentionally plain — every transactional
 * email Strawberry Notes sends should read like a personal note, not a
 * marketing blast. Plain-text is the source of truth; the HTML form is
 * a slim wrapper for clients that prefer it.
 */

import type { EmailMessage } from './client';

export interface PasswordResetEmailInput {
  to: string;
  resetUrl: string;
  expiresInHours: number;
  appName?: string;
}

/** Minimal HTML escape for use in the small inline templates below. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DEFAULT_APP_NAME = 'Strawberry Notes';

export function passwordResetEmail(input: PasswordResetEmailInput): EmailMessage {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const subject = `Reset your ${appName} password`;
  const text =
    `Someone (hopefully you) asked to reset the password for your ${appName} account.\n\n` +
    `To choose a new password, open this link within ${input.expiresInHours} hour${
      input.expiresInHours === 1 ? '' : 's'
    }:\n\n` +
    `${input.resetUrl}\n\n` +
    `If you did not request this, you can ignore this email — your password will stay the same.\n\n` +
    `— ${appName}`;
  const html =
    `<p>Someone (hopefully you) asked to reset the password for your ${esc(appName)} account.</p>` +
    `<p>To choose a new password, open this link within ${input.expiresInHours} hour${
      input.expiresInHours === 1 ? '' : 's'
    }:</p>` +
    `<p><a href="${esc(input.resetUrl)}">${esc(input.resetUrl)}</a></p>` +
    `<p>If you did not request this, you can ignore this email — your password will stay the same.</p>` +
    `<p>— ${esc(appName)}</p>`;
  return { to: input.to, subject, text, html };
}

// ── Email-confirmation (signup) ────────────────────────────────────────

export interface EmailConfirmationInput {
  to: string;
  confirmUrl: string;
  expiresInHours: number;
  appName?: string;
}

export function emailConfirmationEmail(input: EmailConfirmationInput): EmailMessage {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const subject = `Confirm your email for ${appName}`;
  const text =
    `Welcome to ${appName}.\n\n` +
    `Confirm your email by opening this link within ${input.expiresInHours} hour${
      input.expiresInHours === 1 ? '' : 's'
    }:\n\n` +
    `${input.confirmUrl}\n\n` +
    `If you didn't create this account, you can ignore this email — no further action is needed.\n\n` +
    `— ${appName}`;
  const html =
    `<p>Welcome to ${esc(appName)}.</p>` +
    `<p>Confirm your email by opening this link within ${input.expiresInHours} hour${
      input.expiresInHours === 1 ? '' : 's'
    }:</p>` +
    `<p><a href="${esc(input.confirmUrl)}">${esc(input.confirmUrl)}</a></p>` +
    `<p>If you didn't create this account, you can ignore this email — no further action is needed.</p>` +
    `<p>— ${esc(appName)}</p>`;
  return { to: input.to, subject, text, html };
}

// ── Password-changed notice ────────────────────────────────────────────

export interface PasswordChangedInput {
  to: string;
  changedAt: Date;
  /** Where the user can reset again or revoke sessions. */
  loginUrl: string;
  /** Free-form "via" tag — e.g. "self-service reset", "operator CLI". */
  source: string;
  appName?: string;
}

export function passwordChangedEmail(input: PasswordChangedInput): EmailMessage {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const ts = input.changedAt.toISOString();
  const subject = `Your ${appName} password was changed`;
  const text =
    `The password for your ${appName} account just changed.\n\n` +
    `When: ${ts}\n` +
    `How:  ${input.source}\n\n` +
    `If that was you, no action is needed.\n\n` +
    `If it was NOT you, sign in at ${input.loginUrl} and request a fresh password reset, then revoke any tokens or webhooks you don't recognise from Settings.\n\n` +
    `— ${appName}`;
  const html =
    `<p>The password for your ${esc(appName)} account just changed.</p>` +
    `<ul>` +
    `<li><strong>When:</strong> ${esc(ts)}</li>` +
    `<li><strong>How:</strong> ${esc(input.source)}</li>` +
    `</ul>` +
    `<p>If that was you, no action is needed.</p>` +
    `<p>If it was <strong>not</strong> you, <a href="${esc(input.loginUrl)}">sign in</a> and request a fresh password reset, then revoke any tokens or webhooks you don't recognise from Settings.</p>` +
    `<p>— ${esc(appName)}</p>`;
  return { to: input.to, subject, text, html };
}

// ── Personal-access-token created ──────────────────────────────────────

export interface TokenCreatedInput {
  to: string;
  tokenName: string;
  tokenPrefix: string;
  createdAt: Date;
  /** Settings → Tokens URL so the user can revoke if it wasn't them. */
  tokensUrl: string;
  appName?: string;
}

export function tokenCreatedEmail(input: TokenCreatedInput): EmailMessage {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const ts = input.createdAt.toISOString();
  const subject = `New personal access token on your ${appName} account`;
  const text =
    `A new personal access token was created on your ${appName} account.\n\n` +
    `Name:    ${input.tokenName}\n` +
    `Prefix:  ${input.tokenPrefix}…\n` +
    `When:    ${ts}\n\n` +
    `If that was you, no action is needed.\n\n` +
    `If it was NOT you, revoke it now at ${input.tokensUrl} and reset your password.\n\n` +
    `— ${appName}`;
  const html =
    `<p>A new personal access token was created on your ${esc(appName)} account.</p>` +
    `<ul>` +
    `<li><strong>Name:</strong> ${esc(input.tokenName)}</li>` +
    `<li><strong>Prefix:</strong> <code>${esc(input.tokenPrefix)}…</code></li>` +
    `<li><strong>When:</strong> ${esc(ts)}</li>` +
    `</ul>` +
    `<p>If that was you, no action is needed.</p>` +
    `<p>If it was <strong>not</strong> you, <a href="${esc(input.tokensUrl)}">revoke it now</a> and reset your password.</p>` +
    `<p>— ${esc(appName)}</p>`;
  return { to: input.to, subject, text, html };
}

// ── Webhook created ────────────────────────────────────────────────────

export interface WebhookCreatedInput {
  to: string;
  webhookName: string;
  webhookUrl: string;
  events: string[];
  createdAt: Date;
  /** Settings → Webhooks URL so the user can disable / delete. */
  webhooksUrl: string;
  appName?: string;
}

export function webhookCreatedEmail(input: WebhookCreatedInput): EmailMessage {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const ts = input.createdAt.toISOString();
  const subject = `New webhook on your ${appName} account`;
  const text =
    `A new webhook was created on your ${appName} account.\n\n` +
    `Name:    ${input.webhookName}\n` +
    `URL:     ${input.webhookUrl}\n` +
    `Events:  ${input.events.join(', ') || '(none)'}\n` +
    `When:    ${ts}\n\n` +
    `If that was you, no action is needed.\n\n` +
    `If it was NOT you, disable or delete it at ${input.webhooksUrl} and reset your password.\n\n` +
    `— ${appName}`;
  const html =
    `<p>A new webhook was created on your ${esc(appName)} account.</p>` +
    `<ul>` +
    `<li><strong>Name:</strong> ${esc(input.webhookName)}</li>` +
    `<li><strong>URL:</strong> <code>${esc(input.webhookUrl)}</code></li>` +
    `<li><strong>Events:</strong> ${esc(input.events.join(', ') || '(none)')}</li>` +
    `<li><strong>When:</strong> ${esc(ts)}</li>` +
    `</ul>` +
    `<p>If that was you, no action is needed.</p>` +
    `<p>If it was <strong>not</strong> you, <a href="${esc(input.webhooksUrl)}">disable or delete it</a> and reset your password.</p>` +
    `<p>— ${esc(appName)}</p>`;
  return { to: input.to, subject, text, html };
}

// ── Webhook dead-lettered ──────────────────────────────────────────────

export interface WebhookDeadLetterInput {
  to: string;
  webhookName: string;
  webhookUrl: string;
  consecutiveFailures: number;
  lastError: string;
  /** Settings → Webhooks URL so the user can re-enable. */
  webhooksUrl: string;
  appName?: string;
}

export function webhookDeadLetterEmail(input: WebhookDeadLetterInput): EmailMessage {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const subject = `Webhook "${input.webhookName}" was disabled — ${input.consecutiveFailures} consecutive failures`;
  const text =
    `One of your webhooks on ${appName} just hit the dead-letter threshold and was disabled.\n\n` +
    `Name:    ${input.webhookName}\n` +
    `URL:     ${input.webhookUrl}\n` +
    `Failed:  ${input.consecutiveFailures} consecutive attempts\n` +
    `Reason:  ${input.lastError}\n\n` +
    `Once you've fixed the receiver, re-enable it at ${input.webhooksUrl} (the failure counter resets on toggle).\n\n` +
    `— ${appName}`;
  const html =
    `<p>One of your webhooks on ${esc(appName)} just hit the dead-letter threshold and was disabled.</p>` +
    `<ul>` +
    `<li><strong>Name:</strong> ${esc(input.webhookName)}</li>` +
    `<li><strong>URL:</strong> <code>${esc(input.webhookUrl)}</code></li>` +
    `<li><strong>Failed:</strong> ${input.consecutiveFailures} consecutive attempts</li>` +
    `<li><strong>Reason:</strong> <code>${esc(input.lastError)}</code></li>` +
    `</ul>` +
    `<p>Once you've fixed the receiver, <a href="${esc(input.webhooksUrl)}">re-enable it</a> (the failure counter resets on toggle).</p>` +
    `<p>— ${esc(appName)}</p>`;
  return { to: input.to, subject, text, html };
}
