import type { Metadata } from 'next';
import { isEmailConfigured } from '@/lib/email/client';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password — Strawberry Notes' };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm emailEnabled={isEmailConfigured()} />;
}
