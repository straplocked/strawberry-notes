import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';
import {
  getOidcLabel,
  isOidcEnabled,
  isPasswordAuthEnabled,
  isProxyAuthEnabled,
} from '@/lib/auth/mode';
import { MFA_PENDING_COOKIE } from '@/lib/auth/mfa-ticket';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  // Force per-request rendering so the env-driven flags read the running
  // container's env, not the build-time env.
  await headers();

  // In proxy mode, the upstream forward-auth proxy already authed the user.
  // Showing our own /login is confusing and pointless — redirect into the app.
  if (isProxyAuthEnabled()) redirect('/notes');

  const jar = await cookies();
  const hasMfaPending = !!jar.get(MFA_PENDING_COOKIE);

  return (
    <LoginForm
      showSignupLink={isPublicSignupEnabled()}
      passwordAuth={isPasswordAuthEnabled()}
      oidcAuth={isOidcEnabled()}
      oidcLabel={getOidcLabel()}
      initialStep={hasMfaPending ? 'totp' : 'password'}
    />
  );
}
