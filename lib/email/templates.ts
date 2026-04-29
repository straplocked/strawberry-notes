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

export function passwordResetEmail(input: PasswordResetEmailInput): EmailMessage {
  const appName = input.appName ?? 'Strawberry Notes';
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
