/**
 * Webhook delivery — HTTP POST with HMAC signature, exponential-backoff
 * retries, and dead-letter (auto-disable) after 5 consecutive 5xx.
 *
 * Each call site is fire-and-forget: `fireEvent()` schedules a delivery,
 * the user's PATCH/POST returns immediately, and the worker does the
 * outbound POST in the background. Restart-loss is acceptable — webhooks
 * are best-effort and consumers reconcile via the REST API on demand.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { webhooks } from '../db/schema';
import { notifyWebhookDeadLetter } from '../email/notifications';
import { signatureHeader } from './secret';
import type { WebhookEvent, WebhookPayload } from './types';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
const DEAD_LETTER_AFTER = 5;
const BACKOFF_BASE_MS = 1_000;

/** Public for tests — concrete delivery target row shape. */
export interface DeliveryTarget {
  id: string;
  url: string;
  /** Raw secret (decrypted at fire time from the in-memory cache, see fire.ts). */
  secret: string;
}

export interface DeliveryAttempt {
  webhookId: string;
  ok: boolean;
  status: number | null;
  attempt: number;
  errorMessage?: string;
}

interface DeliveryOpts {
  fetchFn?: typeof fetch;
  /** Override the backoff schedule for tests. */
  sleepFn?: (ms: number) => Promise<void>;
  /** Override max attempts for tests. */
  maxAttempts?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * POST a single payload to a single target with retries. On final failure
 * (network error or 5xx, after `maxAttempts`), the row's
 * `consecutive_failures` counter is bumped and `enabled` is flipped to
 * false once it crosses the dead-letter threshold.
 *
 * 4xx responses do NOT retry — the consumer is rejecting our payload, so
 * burning more attempts won't help. They count as failures for the
 * dead-letter counter, though, so a permanently misconfigured URL still
 * eventually disables itself.
 */
export async function deliverOnce(
  target: DeliveryTarget,
  event: WebhookEvent,
  payload: WebhookPayload,
  opts: DeliveryOpts = {},
): Promise<DeliveryAttempt> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleepFn ?? defaultSleep;
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Strawberry-Event': event,
    'X-Strawberry-Signature': signatureHeader(target.secret, body),
    'X-Strawberry-Webhook-Id': target.id,
    'User-Agent': 'Strawberry-Notes-Webhook/1.0',
  };

  let attempt = 0;
  let lastStatus: number | null = null;
  let lastError: string | undefined;

  while (attempt < maxAttempts) {
    attempt += 1;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchFn(target.url, {
        method: 'POST',
        headers,
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);
      lastStatus = res.status;
      if (res.status >= 200 && res.status < 300) {
        await markSuccess(target.id);
        return { webhookId: target.id, ok: true, status: res.status, attempt };
      }
      // 4xx: don't retry — the consumer is actively rejecting.
      if (res.status >= 400 && res.status < 500) {
        lastError = `HTTP ${res.status}`;
        break;
      }
      // 5xx falls through to retry.
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err.message : 'unknown error';
    }
    if (attempt < maxAttempts) {
      // Exponential backoff: 1s, 2s, 4s, 8s.
      await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
    }
  }

  await markFailure(target.id, lastError ?? 'unknown error');
  return {
    webhookId: target.id,
    ok: false,
    status: lastStatus,
    attempt,
    errorMessage: lastError,
  };
}

async function markSuccess(webhookId: string): Promise<void> {
  await db
    .update(webhooks)
    .set({
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
      lastErrorMessage: null,
    })
    .where(eq(webhooks.id, webhookId));
}

async function markFailure(webhookId: string, message: string): Promise<void> {
  // Atomic increment + disable trigger in a single UPDATE so a concurrent
  // delivery cannot race the dead-letter check.
  const updated = await db
    .update(webhooks)
    .set({
      lastFailureAt: new Date(),
      lastErrorMessage: message.slice(0, 500),
      consecutiveFailures: sql`${webhooks.consecutiveFailures} + 1`,
      enabled: sql`case when ${webhooks.consecutiveFailures} + 1 >= ${DEAD_LETTER_AFTER}
                          then false
                          else ${webhooks.enabled}
                      end`,
    })
    .where(eq(webhooks.id, webhookId))
    .returning({
      userId: webhooks.userId,
      name: webhooks.name,
      url: webhooks.url,
      enabled: webhooks.enabled,
      consecutiveFailures: webhooks.consecutiveFailures,
    });

  // Fire the dead-letter notification exactly when the row crossed the
  // threshold. The CASE in the UPDATE means `enabled` is now `false` and
  // `consecutiveFailures` is exactly `DEAD_LETTER_AFTER` only on the
  // crossing fire — re-firing on subsequent failures would be noisy.
  const row = updated[0];
  if (row && !row.enabled && row.consecutiveFailures === DEAD_LETTER_AFTER) {
    void notifyWebhookDeadLetter(row.userId, {
      webhookName: row.name,
      webhookUrl: row.url,
      consecutiveFailures: row.consecutiveFailures,
      lastError: message.slice(0, 500),
    });
  }
}

/** Test-only: expose the dead-letter threshold for assertions. */
export const __TEST = { DEAD_LETTER_AFTER, MAX_ATTEMPTS, BACKOFF_BASE_MS };
