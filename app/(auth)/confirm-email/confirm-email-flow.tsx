'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import styles from '../auth.module.css';

type Status = 'pending' | 'success' | 'invalid' | 'expired' | 'used' | 'no-token' | 'error';

export function ConfirmEmailFlow() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const sp = useSearchParams();
  const token = sp.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'no-token');
  const [resendEmail, setResendEmail] = useState('');
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/confirm-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.ok) {
          setStatus('success');
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const reason = body.error;
        if (reason === 'expired' || reason === 'used' || reason === 'invalid') {
          setStatus(reason);
        } else {
          setStatus('error');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    await fetch('/api/auth/resend-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resendEmail.trim() }),
    });
    setResendDone(true);
  }

  if (status === 'success') {
    return (
      <>
        <h1 className={styles.h1}>Email confirmed</h1>
        <p className={styles.subtitle}>
          You can now sign in. Your account is fully active.
        </p>
        <div className={styles.switch}>
          <Link className={styles.link} href="/login">
            Sign in
          </Link>
        </div>
      </>
    );
  }

  if (status === 'pending') {
    return (
      <>
        <h1 className={styles.h1}>Confirming…</h1>
        <p className={styles.subtitle}>One moment.</p>
      </>
    );
  }

  if (status === 'no-token') {
    return (
      <>
        <h1 className={styles.h1}>Confirm your email</h1>
        <p className={styles.subtitle}>
          Open the link from your inbox. Lost it? Enter your email below and we’ll send it again.
        </p>
        {resendDone ? (
          <p className={styles.subtitle}>
            If <strong>{resendEmail}</strong> matches a pending account, the link is on its way.
          </p>
        ) : (
          <form className={styles.form} onSubmit={onResend}>
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
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
              />
            </div>
            <button className={styles.submit} type="submit" disabled={!resendEmail.trim()}>
              Send link
            </button>
          </form>
        )}
        <div className={styles.switch}>
          <Link className={styles.link} href="/login">
            Back to sign in
          </Link>
        </div>
      </>
    );
  }

  // invalid / expired / used / error
  const message =
    status === 'expired'
      ? 'That confirmation link has expired. Request a fresh one.'
      : status === 'used'
        ? 'That confirmation link has already been used. If you can sign in, you’re good.'
        : status === 'invalid'
          ? 'That confirmation link doesn’t look right. Request a fresh one.'
          : 'Something went wrong confirming your email. Try again in a minute.';

  return (
    <>
      <h1 className={styles.h1}>Couldn’t confirm</h1>
      <p className={styles.error} style={{ marginBottom: 16 }}>
        {message}
      </p>
      {resendDone ? (
        <p className={styles.subtitle}>
          If <strong>{resendEmail}</strong> matches a pending account, a new link is on its way.
        </p>
      ) : (
        <form className={styles.form} onSubmit={onResend}>
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
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
            />
          </div>
          <button className={styles.submit} type="submit" disabled={!resendEmail.trim()}>
            Send a new link
          </button>
        </form>
      )}
      <div className={styles.switch}>
        <Link className={styles.link} href="/login">
          Back to sign in
        </Link>
      </div>
    </>
  );
}
