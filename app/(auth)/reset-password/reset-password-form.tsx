'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../auth.module.css';

export function ResetPasswordForm() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!token) {
      setError('Missing reset token. Use the link from your email.');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const reason = body.error;
        if (reason === 'expired') {
          setError('That reset link has expired. Request a new one.');
        } else if (reason === 'used') {
          setError('That reset link was already used. Request a new one if you still need to.');
        } else if (reason === 'invalid') {
          setError("That reset link doesn't look right. Request a new one.");
        } else if (reason === 'password_too_short') {
          setError('Password must be at least 8 characters.');
        } else {
          setError(`Something went wrong (${res.status}). Try again.`);
        }
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 1500);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <>
        <h1 className={styles.h1}>Password updated</h1>
        <p className={styles.subtitle}>
          You can now sign in with your new password. Redirecting to the sign-in page…
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.h1}>Choose a new password</h1>
      <p className={styles.subtitle}>
        Pick something at least 8 characters. After saving you’ll be redirected back to sign-in.
      </p>
      <form className={styles.form} onSubmit={onSubmit}>
        <div>
          <label className={styles.label} htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className={styles.label} htmlFor="confirm">
            Confirm
          </label>
          <input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            className={styles.input}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button
          className={styles.submit}
          type="submit"
          disabled={pending || !password || !confirm}
        >
          {pending ? 'Saving…' : 'Save new password'}
        </button>
      </form>
      <div className={styles.switch}>
        <Link className={styles.link} href="/login">
          Back to sign in
        </Link>
      </div>
    </>
  );
}
