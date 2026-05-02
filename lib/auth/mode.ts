/**
 * Auth-mode env switches. Composable: an operator can run any combination
 * of password / TOTP / OIDC. Proxy mode is exclusive — when on, the app
 * trusts a configured forward-auth header and skips first-party login.
 *
 * Default with no env set is identical to v1 (password-only).
 */

function envBool(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

export function isPasswordAuthEnabled(): boolean {
  // Default true — flipping PASSWORD_AUTH=false disables the credentials
  // form (use this when the instance is OIDC-only or proxy-only).
  const raw = (process.env.PASSWORD_AUTH ?? '').trim().toLowerCase();
  if (raw === '') return true;
  return envBool(raw);
}

export function isTotpEnabled(): boolean {
  return envBool(process.env.TOTP_ENABLED);
}

export function getOidcIssuer(): string | null {
  const v = (process.env.OIDC_ISSUER ?? '').trim();
  return v || null;
}
export function getOidcClientId(): string | null {
  const v = (process.env.OIDC_CLIENT_ID ?? '').trim();
  return v || null;
}
export function getOidcClientSecret(): string | null {
  const v = (process.env.OIDC_CLIENT_SECRET ?? '').trim();
  return v || null;
}
export function getOidcLabel(): string {
  const v = (process.env.OIDC_NAME ?? '').trim();
  return v || 'SSO';
}

export function isOidcEnabled(): boolean {
  if (!envBool(process.env.OIDC_ENABLED)) return false;
  return !!(getOidcIssuer() && getOidcClientId() && getOidcClientSecret());
}

export function oidcAutoProvision(): boolean {
  return envBool(process.env.OIDC_AUTO_PROVISION);
}

/** Risky: lets an IdP-side admin take over an existing email-matching local
 * account. Off by default. Document the threat model loudly when on. */
export function oidcTrustEmailForLinking(): boolean {
  return envBool(process.env.OIDC_TRUST_EMAIL_FOR_LINKING);
}

export function isProxyAuthEnabled(): boolean {
  return envBool(process.env.PROXY_AUTH);
}

export function getProxyUserHeader(): string {
  const v = (process.env.PROXY_AUTH_USER_HEADER ?? '').trim().toLowerCase();
  return v || 'x-authentik-username';
}

export function getProxyEmailHeader(): string {
  const v = (process.env.PROXY_AUTH_EMAIL_HEADER ?? '').trim().toLowerCase();
  return v || 'x-authentik-email';
}

export function getProxySharedSecret(): string | null {
  const v = (process.env.PROXY_AUTH_SHARED_SECRET ?? '').trim();
  return v || null;
}

/** Comma-separated CIDRs allowed to send the trusted header. Read from the
 * connecting socket peer, not X-Forwarded-For (which is itself untrusted). */
export function getProxyTrustedCidrs(): string[] {
  return (process.env.PROXY_AUTH_TRUSTED_IPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Where the sign-out button points in proxy mode (e.g. Authentik's
 * `/outpost.goauthentik.io/sign_out`). Null = hide the button entirely. */
export function getProxyLogoutUrl(): string | null {
  const v = (process.env.PROXY_AUTH_LOGOUT_URL ?? '').trim();
  return v || null;
}
