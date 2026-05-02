import type { Metadata } from 'next';
import { ConfirmEmailFlow } from './confirm-email-flow';

export const metadata: Metadata = { title: 'Confirm email — Strawberry Notes' };

export default function ConfirmEmailPage() {
  return <ConfirmEmailFlow />;
}
