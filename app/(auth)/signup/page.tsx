import { notFound } from 'next/navigation';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';
import { SignupForm } from './signup-form';

export default function SignupPage() {
  if (!isPublicSignupEnabled()) notFound();
  return <SignupForm />;
}
