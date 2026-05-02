'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '../auth.module.css';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as { configured?: boolean };
      setServerConfigured(body.configured ?? null);
      setSubmitted(true);
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <>
        <h1 className={styles.h1}>Check your inbox</h1>
        {serverConfigured === false ? (
          <p className={styles.subtitle}>
            Email-based password reset isn’t enabled on this instance. Ask the operator to run{' '}
            <code>npm run user:reset -- {email || '<your-email>'}</code> on the server, or to
            configure SMTP.
          </p>
        ) : (
          <p className={styles.subtitle}>
            If <strong>{email}</strong> matches an account, we’ve sent a link with instructions to
            choose a new password. The link expires in 1 hour.
          </p>
        )}
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
      <h1 className={styles.h1}>Forgot your password?</h1>
      <p className={styles.subtitle}>
        Enter your email and we’ll send you a link to choose a new one.
      </p>
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
        <button className={styles.submit} type="submit" disabled={pending || !email.trim()}>
          {pending ? 'Sending…' : 'Send reset link'}
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
