import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';
import { SignupForm } from './signup-form';

export default async function SignupPage() {
  // Force per-request rendering so isPublicSignupEnabled() reads the running
  // container's env, not the build-time env. Without this the page returns
  // 404 forever even after the operator flips ALLOW_PUBLIC_SIGNUP=true.
  await headers();
  if (!isPublicSignupEnabled()) notFound();
  return <SignupForm />;
}
