import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';
import { isSetupModeActive } from '@/lib/auth/bootstrap';
import { SignupForm } from './signup-form';

export default async function SignupPage() {
  // Force per-request rendering so these env/DB-derived flags read the
  // running container's state, not a build-time snapshot. Without this the
  // page would 404 forever even after ALLOW_PUBLIC_SIGNUP=true, or never
  // notice the instance has gained its first user.
  await headers();
  const setupMode = await isSetupModeActive();
  if (!setupMode && !isPublicSignupEnabled()) notFound();
  return <SignupForm setupMode={setupMode} />;
}
