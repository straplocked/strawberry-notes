import type { Metadata } from 'next';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Reset password — Strawberry Notes' };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
