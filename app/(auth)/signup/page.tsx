'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import styles from '../auth.module.css';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: 'Signup failed' }));
      setError(msg ?? 'Signup failed');
      setPending(false);
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

  return (
    <>
      <h1 className={styles.h1}>Plant your notebook</h1>
      <p className={styles.subtitle}>8+ character password. No email verification — just you and your notes.</p>
      <form className={styles.form} onSubmit={onSubmit}>
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
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <div className={styles.switch}>
        Already have an account?{' '}
        <Link className={styles.link} href="/login">
          Sign in
        </Link>
      </div>
    </>
  );
}
