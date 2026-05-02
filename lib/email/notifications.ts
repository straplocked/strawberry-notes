/**
 * Transactional notifications fan-out.
 *
 * Each `notify*` helper is fire-and-forget: it looks up the recipient's
 * email and notification preference, builds the templated email, and
 * sends via SMTP. Failures are logged and swallowed — the caller's
 * primary mutation must not block on notification delivery.
 *
 * Notifications are gated by:
 *   1. SMTP must be configured (else the helper is a no-op).
 *   2. The user must have the matching toggle enabled.
 * Both default ON; users opt out from Settings → Email notifications.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { isEmailConfigured, sendMail } from './client';
import { isNotificationEnabled, type NotificationKind } from './preferences';
import {
  passwordChangedEmail,
  tokenCreatedEmail,
  webhookCreatedEmail,
  webhookDeadLetterEmail,
  type PasswordChangedInput,
} from './templates';

function publicBaseUrl(): string {
  return (process.env.AUTH_URL?.trim() || 'http://localhost:3200').replace(/\/+$/, '');
}

async function emailFor(userId: string): Promise<string | null> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return row?.email ?? null;
}

interface FireOpts {
  /** Test-only: short-circuit the SMTP-configured + preference checks. */
  skipGates?: boolean;
}

/**
 * Generic dispatcher: look up recipient + check the gate, fall through to
 * the per-kind builder. Each public `notify*` wraps this with its kind.
 */
async function fire<T>(
  userId: string,
  kind: NotificationKind,
  build: (to: string) => T,
  send: (msg: T) => Promise<unknown>,
  opts: FireOpts,
): Promise<void> {
  if (!opts.skipGates) {
    if (!isEmailConfigured()) return;
    if (!(await isNotificationEnabled(userId, kind))) return;
  }
  const to = await emailFor(userId);
  if (!to) return;
  try {
    await send(build(to));
  } catch (err) {
    console.error('[notifications] send error', { userId, kind, err });
  }
}

// ── Public fire-helpers ────────────────────────────────────────────────

export interface PasswordChangedContext {
  source: PasswordChangedInput['source'];
  changedAt?: Date;
}

export function notifyPasswordChanged(
  userId: string,
  ctx: PasswordChangedContext,
  opts: FireOpts = {},
): void {
  void fire(
    userId,
    'passwordChanged',
    (to) =>
      passwordChangedEmail({
        to,
        changedAt: ctx.changedAt ?? new Date(),
        loginUrl: `${publicBaseUrl()}/login`,
        source: ctx.source,
      }),
    sendMail,
    opts,
  );
}

export interface TokenCreatedContext {
  tokenName: string;
  tokenPrefix: string;
  createdAt?: Date;
}

export function notifyTokenCreated(
  userId: string,
  ctx: TokenCreatedContext,
  opts: FireOpts = {},
): void {
  void fire(
    userId,
    'tokenCreated',
    (to) =>
      tokenCreatedEmail({
        to,
        tokenName: ctx.tokenName,
        tokenPrefix: ctx.tokenPrefix,
        createdAt: ctx.createdAt ?? new Date(),
        tokensUrl: `${publicBaseUrl()}/settings`,
      }),
    sendMail,
    opts,
  );
}

export interface WebhookCreatedContext {
  webhookName: string;
  webhookUrl: string;
  events: string[];
  createdAt?: Date;
}

export function notifyWebhookCreated(
  userId: string,
  ctx: WebhookCreatedContext,
  opts: FireOpts = {},
): void {
  void fire(
    userId,
    'webhookCreated',
    (to) =>
      webhookCreatedEmail({
        to,
        webhookName: ctx.webhookName,
        webhookUrl: ctx.webhookUrl,
        events: ctx.events,
        createdAt: ctx.createdAt ?? new Date(),
        webhooksUrl: `${publicBaseUrl()}/settings`,
      }),
    sendMail,
    opts,
  );
}

export interface WebhookDeadLetterContext {
  webhookName: string;
  webhookUrl: string;
  consecutiveFailures: number;
  lastError: string;
}

export function notifyWebhookDeadLetter(
  userId: string,
  ctx: WebhookDeadLetterContext,
  opts: FireOpts = {},
): void {
  void fire(
    userId,
    'webhookDeadLetter',
    (to) =>
      webhookDeadLetterEmail({
        to,
        webhookName: ctx.webhookName,
        webhookUrl: ctx.webhookUrl,
        consecutiveFailures: ctx.consecutiveFailures,
        lastError: ctx.lastError,
        webhooksUrl: `${publicBaseUrl()}/settings`,
      }),
    sendMail,
    opts,
  );
}
