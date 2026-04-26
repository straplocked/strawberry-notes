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
