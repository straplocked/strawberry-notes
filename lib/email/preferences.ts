/**
 * Per-user email-notification preferences.
 *
 * Each row is a flat set of booleans, one per notification kind. Absence
 * of a row is treated as "all defaults ON" — the security-relevant
 * "wait, that wasn't me" alert is the floor, and the user opts down from
 * there.
 *
 * The signup-confirmation email is intentionally NOT a per-user flag —
 * that's an instance-level operator choice (`REQUIRE_EMAIL_CONFIRMATION`
 * env). A user can't opt out of confirming their own email.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { userEmailPreferences } from '../db/schema';

export const NOTIFICATION_KINDS = [
  'passwordChanged',
  'tokenCreated',
  'webhookCreated',
  'webhookDeadLetter',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type EmailPreferences = Record<NotificationKind, boolean>;

export const DEFAULT_PREFERENCES: EmailPreferences = {
  passwordChanged: true,
  tokenCreated: true,
  webhookCreated: true,
  webhookDeadLetter: true,
};

/**
 * Read the user's preferences. Returns the defaults when no row exists —
 * we don't need to write a row until the user actually changes something.
 */
export async function getEmailPreferences(userId: string): Promise<EmailPreferences> {
  const [row] = await db
    .select()
    .from(userEmailPreferences)
    .where(eq(userEmailPreferences.userId, userId));
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    passwordChanged: row.passwordChanged,
    tokenCreated: row.tokenCreated,
    webhookCreated: row.webhookCreated,
    webhookDeadLetter: row.webhookDeadLetter,
  };
}

/** Returns true when the user wants this kind of notification. */
export async function isNotificationEnabled(
  userId: string,
  kind: NotificationKind,
): Promise<boolean> {
  const prefs = await getEmailPreferences(userId);
  return prefs[kind];
}

/**
 * Update a partial set of preferences. Upserts the row — first call from
 * the Settings panel writes it; subsequent calls update in place.
 */
export async function setEmailPreferences(
  userId: string,
  patch: Partial<EmailPreferences>,
): Promise<EmailPreferences> {
  const cleaned: Partial<EmailPreferences> = {};
  for (const k of NOTIFICATION_KINDS) {
    if (typeof patch[k] === 'boolean') cleaned[k] = patch[k];
  }
  const merged = { ...DEFAULT_PREFERENCES, ...cleaned };
  await db
    .insert(userEmailPreferences)
    .values({ userId, ...merged })
    .onConflictDoUpdate({
      target: userEmailPreferences.userId,
      set: { ...cleaned, updatedAt: sql`now()` },
    });
  return getEmailPreferences(userId);
}
