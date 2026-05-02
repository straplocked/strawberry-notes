/**
 * Single source of truth for whether the public signup route is enabled.
 *
 * Default: closed. Operators opt in by setting ALLOW_PUBLIC_SIGNUP=true.
 * Closed instances still bootstrap users via `npm run user:create`.
 */
export function isPublicSignupEnabled(): boolean {
  const v = (process.env.ALLOW_PUBLIC_SIGNUP ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * When set, public signup creates the user with `emailConfirmedAt = null`,
 * the credentials provider rejects sign-in until the user clicks a
 * confirmation link emailed at signup time. Operator-created accounts
 * (`npm run user:create`) come pre-confirmed regardless.
 *
 * Implies SMTP must be configured — without a way to send the email the
 * user would be locked out of their own brand-new account.
 */
export function isEmailConfirmationRequired(): boolean {
  const v = (process.env.REQUIRE_EMAIL_CONFIRMATION ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
