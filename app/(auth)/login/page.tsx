import { headers } from 'next/headers';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  // Force per-request rendering so isPublicSignupEnabled() reads the running
  // container's env, not the build-time env. Without this, `output: "standalone"`
  // pre-renders the page when ALLOW_PUBLIC_SIGNUP isn't set yet.
  await headers();
  return <LoginForm showSignupLink={isPublicSignupEnabled()} />;
}
