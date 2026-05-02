/**
 * Email content. Keep these intentionally plain — every transactional
 * email Strawberry Notes sends should read like a personal note, not a
 * marketing blast. Plain-text is the source of truth; the HTML form is
 * a slim branded wrapper for clients that prefer it.
 *
 * The HTML uses a table-based layout with inline styles only — no <style>
 * tags, no class selectors, no flex/grid, no SVG — so it renders
 * consistently across Outlook 2016+, Gmail (web/iOS/Android), Apple Mail
 * (macOS/iOS), and Outlook.com. Brand tokens mirror the prototype in
 * claude.ai/design (Branded Emails, Variant A — "Classic letter").
 */

import type { EmailMessage } from './client';

export interface PasswordResetEmailInput {
  to: string;
  resetUrl: string;
  expiresInHours: number;
  appName?: string;
}

/** Minimal HTML escape for the inline templates below. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DEFAULT_APP_NAME = 'Strawberry Notes';

// Brand tokens — mirror the prototype's --berry / --leaf / paper system.
const BRAND = {
  berry: '#e33d4e',
  berryInk: '#b02537',
  leaf: '#5fae6a',
  bg: '#f4ece4',
  cream: '#fbf3ec',
  paper: '#ffffff',
  hair: '#ebd9cf',
  ink: '#1e110f',
  ink2: '#4a2e28',
  ink3: '#7a5a52',
  ink4: '#ab8a82',
  fontDisplay: "'Bricolage Grotesque','Iowan Old Style','Palatino','Georgia',serif",
  fontSans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
  fontMono: "'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace",
} as const;

interface ShellInput {
  appName: string;
  /** Small uppercase mono caption shown under the wordmark. */
  caption: string;
  /** Hidden preheader — Gmail / Apple Mail show this under the subject. */
  previewText: string;
  /** Inner content of the white card body. Must already be HTML-escaped. */
  bodyHtml: string;
}

/**
 * Wrap body HTML in the branded shell — cream header band with the
 * strawberry mark + wordmark, white card body with hairline border, tiny
 * mono footer. The shell is the same for every transactional email; only
 * the caption + body HTML change per type.
 *
 * The logo is the 🍓 emoji — renders everywhere, zero dependencies.
 * Swap to a base64 PNG data URI in the logo cell if you ever want a
 * pixel-faithful brand mark; the surrounding markup stays the same.
 */
function renderShell(input: ShellInput): string {
  const safeApp = esc(input.appName);
  const safeCaption = esc(input.caption);
  const safePreview = esc(input.previewText);
  const slug = esc(input.appName.toLowerCase().replace(/\s+/g, ''));
  return (
    `<div style="display:none;overflow:hidden;visibility:hidden;opacity:0;height:0;width:0;color:transparent;">${safePreview}</div>` +
    `<div style="background:${BRAND.bg};padding:32px 16px;font-family:${BRAND.fontSans};color:${BRAND.ink};">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">` +
        `<tr><td align="center">` +
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:100%;border-collapse:collapse;">` +
            // Header band
            `<tr><td style="background:${BRAND.cream};border-top-left-radius:14px;border-top-right-radius:14px;border:1px solid ${BRAND.hair};border-bottom:none;padding:22px 28px;">` +
              `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">` +
                `<tr>` +
                  `<td valign="middle" align="left" style="width:36px;font-size:28px;line-height:32px;">🍓</td>` +
                  `<td valign="middle" style="padding-left:12px;">` +
                    `<div style="font-family:${BRAND.fontDisplay};font-size:18px;font-weight:600;color:${BRAND.ink};letter-spacing:-0.01em;line-height:24px;">${safeApp}</div>` +
                    `<div style="font-family:${BRAND.fontMono};font-size:10.5px;color:${BRAND.ink3};text-transform:uppercase;letter-spacing:0.14em;line-height:14px;margin-top:2px;">${safeCaption}</div>` +
                  `</td>` +
                `</tr>` +
              `</table>` +
            `</td></tr>` +
            // Body card
            `<tr><td style="background:${BRAND.paper};border:1px solid ${BRAND.hair};border-top:none;border-bottom-left-radius:14px;border-bottom-right-radius:14px;padding:36px 36px 32px;">` +
              input.bodyHtml +
            `</td></tr>` +
            // Footer
            `<tr><td style="padding:20px 28px 0;">` +
              `<p style="margin:0;font-family:${BRAND.fontMono};font-size:11px;line-height:18px;color:${BRAND.ink4};text-align:center;letter-spacing:0.06em;">Sent from ${slug}.app · self-hosted</p>` +
            `</td></tr>` +
          `</table>` +
        `</td></tr>` +
      `</table>` +
    `</div>`
  );
}

/**
 * Outlook-safe primary CTA. The matching bg + border + inline-block + hard
 * padding keep the button rendering as a button on Outlook for Windows
 * (which ignores border-radius and many other modern properties).
 */
function brandedButton(href: string, label: string): string {
  return (
    `<a href="${esc(href)}" style="display:inline-block;background-color:${BRAND.berry};` +
    `color:#ffffff;text-decoration:none;font-family:${BRAND.fontSans};font-weight:600;` +
    `font-size:15px;line-height:20px;letter-spacing:0.01em;padding:14px 28px;` +
    `border-radius:10px;border:1px solid ${BRAND.berry};mso-line-height-rule:exactly;">` +
    `${esc(label)}</a>`
  );
}

function bodyHeading(text: string): string {
  return (
    `<h1 style="margin:0 0 18px;font-family:${BRAND.fontDisplay};font-weight:600;font-size:28px;` +
    `line-height:34px;letter-spacing:-0.015em;color:${BRAND.ink};">${text}</h1>`
  );
}

function bodyP(html: string): string {
  return (
    `<p style="margin:0 0 14px;font-family:${BRAND.fontSans};font-size:15.5px;line-height:24px;color:${BRAND.ink2};">${html}</p>`
  );
}

function bodyPLast(html: string): string {
  return (
    `<p style="margin:0 0 28px;font-family:${BRAND.fontSans};font-size:15.5px;line-height:24px;color:${BRAND.ink2};">${html}</p>`
  );
}

function disclaimerP(html: string): string {
  return (
    `<p style="margin:0;font-family:${BRAND.fontSans};font-size:13px;line-height:20px;color:${BRAND.ink3};">${html}</p>`
  );
}

function hairlineDivider(): string {
  return `<div style="height:1px;background:${BRAND.hair};margin:0 0 24px;line-height:1px;font-size:0;">&nbsp;</div>`;
}

/** Plain-link fallback shown under a CTA button. Corporate mail filters
 * sometimes strip / rewrite buttons, so every email with a button needs one. */
function urlFallback(url: string): string {
  const safe = esc(url);
  return (
    `<p style="margin:0 0 6px;font-family:${BRAND.fontSans};font-size:13px;line-height:20px;color:${BRAND.ink3};">` +
      `Or paste this link into your browser:` +
    `</p>` +
    `<p style="margin:0 0 32px;font-family:${BRAND.fontMono};font-size:12.5px;line-height:20px;color:${BRAND.berryInk};word-break:break-all;">` +
      `<a href="${safe}" style="color:${BRAND.berryInk};text-decoration:underline;">${safe}</a>` +
    `</p>`
  );
}

function buttonRow(href: string, label: string): string {
  return `<div style="margin:0 0 28px;">${brandedButton(href, label)}</div>`;
}

/** An inline anchor styled in the brand colour. Used where a paragraph
 * carries the CTA inline (notification emails: "if it wasn't you, …"). */
function inlineLink(href: string, label: string): string {
  return `<a href="${esc(href)}" style="color:${BRAND.berryInk};text-decoration:underline;">${esc(label)}</a>`;
}

/** A definition row inside an info card — small mono uppercase label
 * followed by the value (already-escaped HTML). */
function infoRow(label: string, valueHtml: string): string {
  return (
    `<li style="margin:0 0 6px;font-family:${BRAND.fontSans};font-size:14px;line-height:22px;color:${BRAND.ink2};">` +
      `<span style="display:inline-block;min-width:64px;font-family:${BRAND.fontMono};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.ink3};margin-right:8px;">${esc(label)}</span>` +
      valueHtml +
    `</li>`
  );
}

function infoCard(rowsHtml: string): string {
  return (
    `<ul style="margin:0 0 22px;padding:14px 18px;background:${BRAND.cream};border:1px solid ${BRAND.hair};border-radius:10px;list-style:none;">` +
      rowsHtml +
    `</ul>`
  );
}

// ── Password reset ─────────────────────────────────────────────────────

export function passwordResetEmail(input: PasswordResetEmailInput): EmailMessage {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const subject = `Reset your ${appName} password`;
  const hourLabel = `${input.expiresInHours} hour${input.expiresInHours === 1 ? '' : 's'}`;
  const text =
    `Someone (hopefully you) asked to reset the password for your ${appName} account.\n\n` +
    `To choose a new password, open this link within ${hourLabel}:\n\n` +
    `${input.resetUrl}\n\n` +
    `If you did not request this, you can ignore this email — your password will stay the same.\n\n` +
    `— ${appName}`;
  const safeApp = esc(appName);
  const body =
    bodyHeading('Reset your password') +
    bodyP(`Someone (hopefully you) asked to reset the password for your ${safeApp} account.`) +
    bodyPLast(
      `To choose a new password, open the link below within ` +
        `<strong style="color:${BRAND.ink};">${esc(hourLabel)}</strong>.`,
    ) +
    buttonRow(input.resetUrl, 'Choose a new password') +
    urlFallback(input.resetUrl) +
    hairlineDivider() +
    disclaimerP(
      `If you didn't request this, you can safely ignore this email — your password will stay the same.`,
    );
  const html = renderShell({
    appName,
    caption: 'Account · Security',
    previewText: `Reset your ${appName} password — link expires in ${hourLabel}.`,
    bodyHtml: body,
  });
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
  const hourLabel = `${input.expiresInHours} hour${input.expiresInHours === 1 ? '' : 's'}`;
  const text =
    `Welcome to ${appName}.\n\n` +
    `Confirm your email by opening this link within ${hourLabel}:\n\n` +
    `${input.confirmUrl}\n\n` +
    `If you didn't create this account, you can ignore this email — no further action is needed.\n\n` +
    `— ${appName}`;
  const safeApp = esc(appName);
  const body =
    bodyHeading('Confirm your email') +
    bodyP(`Welcome to ${safeApp}.`) +
    bodyPLast(
      `Confirm your email by opening the link below within ` +
        `<strong style="color:${BRAND.ink};">${esc(hourLabel)}</strong>.`,
    ) +
    buttonRow(input.confirmUrl, 'Confirm your email') +
    urlFallback(input.confirmUrl) +
    hairlineDivider() +
    disclaimerP(
      `If you didn't create this account, you can ignore this email — no further action is needed.`,
    );
  const html = renderShell({
    appName,
    caption: 'Welcome · Confirmation',
    previewText: `Confirm your email for ${appName} — link expires in ${hourLabel}.`,
    bodyHtml: body,
  });
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
  const safeApp = esc(appName);
  const body =
    bodyHeading('Password changed') +
    bodyP(`The password for your ${safeApp} account just changed.`) +
    infoCard(infoRow('When', esc(ts)) + infoRow('How', esc(input.source))) +
    bodyP('If that was you, no action is needed.') +
    bodyPLast(
      `If it was <strong style="color:${BRAND.ink};">not</strong> you, ` +
        `${inlineLink(input.loginUrl, 'sign in')} and request a fresh password reset, ` +
        `then revoke any tokens or webhooks you don't recognise from Settings.`,
    );
  const html = renderShell({
    appName,
    caption: 'Account · Security',
    previewText: `Your ${appName} password was changed.`,
    bodyHtml: body,
  });
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
  const safeApp = esc(appName);
  const body =
    bodyHeading('New access token') +
    bodyP(`A new personal access token was created on your ${safeApp} account.`) +
    infoCard(
      infoRow('Name', esc(input.tokenName)) +
        infoRow(
          'Prefix',
          `<span style="font-family:${BRAND.fontMono};font-size:13px;color:${BRAND.berryInk};"><code>${esc(input.tokenPrefix)}…</code></span>`,
        ) +
        infoRow('When', esc(ts)),
    ) +
    bodyP('If that was you, no action is needed.') +
    bodyPLast(
      `If it was <strong style="color:${BRAND.ink};">not</strong> you, ` +
        `${inlineLink(input.tokensUrl, 'revoke it now')} and reset your password.`,
    );
  const html = renderShell({
    appName,
    caption: 'Account · Tokens',
    previewText: `New personal access token on your ${appName} account.`,
    bodyHtml: body,
  });
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
  const safeApp = esc(appName);
  const events = input.events.join(', ') || '(none)';
  const body =
    bodyHeading('New webhook') +
    bodyP(`A new webhook was created on your ${safeApp} account.`) +
    infoCard(
      infoRow('Name', esc(input.webhookName)) +
        infoRow(
          'URL',
          `<span style="font-family:${BRAND.fontMono};font-size:13px;color:${BRAND.berryInk};word-break:break-all;"><code>${esc(input.webhookUrl)}</code></span>`,
        ) +
        infoRow('Events', esc(events)) +
        infoRow('When', esc(ts)),
    ) +
    bodyP('If that was you, no action is needed.') +
    bodyPLast(
      `If it was <strong style="color:${BRAND.ink};">not</strong> you, ` +
        `${inlineLink(input.webhooksUrl, 'disable or delete it')} and reset your password.`,
    );
  const html = renderShell({
    appName,
    caption: 'Account · Webhooks',
    previewText: `New webhook on your ${appName} account.`,
    bodyHtml: body,
  });
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
  const safeApp = esc(appName);
  const body =
    bodyHeading('Webhook disabled') +
    bodyP(
      `One of your webhooks on ${safeApp} just hit the dead-letter threshold and was disabled.`,
    ) +
    infoCard(
      infoRow('Name', esc(input.webhookName)) +
        infoRow(
          'URL',
          `<span style="font-family:${BRAND.fontMono};font-size:13px;color:${BRAND.berryInk};word-break:break-all;"><code>${esc(input.webhookUrl)}</code></span>`,
        ) +
        infoRow('Failed', `${input.consecutiveFailures} consecutive attempts`) +
        infoRow(
          'Reason',
          `<span style="font-family:${BRAND.fontMono};font-size:13px;color:${BRAND.ink2};"><code>${esc(input.lastError)}</code></span>`,
        ),
    ) +
    bodyPLast(
      `Once you've fixed the receiver, ${inlineLink(input.webhooksUrl, 're-enable it')} ` +
        `(the failure counter resets on toggle).`,
    );
  const html = renderShell({
    appName,
    caption: 'Webhooks · Disabled',
    previewText: `Webhook "${input.webhookName}" was disabled after ${input.consecutiveFailures} consecutive failures.`,
    bodyHtml: body,
  });
  return { to: input.to, subject, text, html };
}
