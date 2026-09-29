'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import styles from '../auth.module.css';

export interface SignupFormProps {
  /** True when this instance has no users yet and is showing the
   * zero-config setup-code flow instead of ordinary public signup. */
  setupMode?: boolean;
}

export function SignupForm({ setupMode = false }: SignupFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(setupMode ? { email, password, setupCode } : { email, password }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: 'Signup failed' }));
      setError(msg ?? 'Signup failed');
      setPending(false);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { confirmationRequired?: boolean };
    if (body.confirmationRequired) {
      // The credentials provider rejects sign-in until the email link is
      // clicked. Show a "check your inbox" panel instead of trying signIn.
      setPending(false);
      setPendingConfirmation(true);
      return;
    }
    const signInRes = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setPending(false);
    if (!signInRes || signInRes.error) {
      setError('Account created but sign-in failed. Try the login page.');
      return;
    }
    router.push('/notes');
    router.refresh();
  }

  if (pendingConfirmation) {
    return (
      <>
        <h1 className={styles.h1}>Check your inbox</h1>
        <p className={styles.subtitle}>
          We just emailed <strong>{email}</strong> a link to confirm your account. Click it within
          24 hours and you’ll be able to sign in.
        </p>
        <div className={styles.switch}>
          <Link className={styles.link} href="/login">
            Back to sign in
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.h1}>{setupMode ? 'Set up Strawberry Notes' : 'Plant your notebook'}</h1>
      <p className={styles.subtitle}>
        {setupMode
          ? 'First run — create the admin account. Find the setup code in the container logs (docker compose logs app).'
          : '8+ character password.'}
      </p>
      <form className={styles.form} onSubmit={onSubmit}>
        {setupMode && (
          <div>
            <label className={styles.label} htmlFor="setupCode">
              Setup code
            </label>
            <input
              id="setupCode"
              type="text"
              required
              autoComplete="off"
              placeholder="XXXX-XXXX"
              className={styles.input}
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
            />
          </div>
        )}
        <div>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? 'Creating…' : setupMode ? 'Create admin account' : 'Create account'}
        </button>
      </form>
      {!setupMode && (
        <div className={styles.switch}>
          Already have an account?{' '}
          <Link className={styles.link} href="/login">
            Sign in
          </Link>
        </div>
      )}
    </>
  );
}
