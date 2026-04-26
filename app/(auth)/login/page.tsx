import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return <LoginForm showSignupLink={isPublicSignupEnabled()} />;
}
