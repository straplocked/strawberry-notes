'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import styles from '../auth.module.css';

export interface LoginFormProps {
  showSignupLink: boolean;
  passwordAuth: boolean;
  oidcAuth: boolean;
  oidcLabel: string;
  initialStep: 'password' | 'totp';
}

export function LoginForm(props: LoginFormProps) {
  return (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  );
}

type Step = 'password' | 'totp';

function Inner({
  showSignupLink,
  passwordAuth,
  oidcAuth,
  oidcLabel,
  initialStep,
}: LoginFormProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = sp.get('callbackUrl') ?? '/notes';

  const [step, setStep] = useState<Step>(initialStep);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    setPending(false);
    if (!res || res.error) {
      // Could be wrong creds OR could be "TOTP required" — the credentials
      // provider sets a non-httpOnly `snb_mfa_pending` flag alongside the
      // signed ticket cookie when TOTP is enrolled. If the flag is present,
      // switch to the TOTP screen.
      if (hasMfaPendingCookie()) {
        setStep('totp');
        setCode('');
        return;
      }
      setError('Wrong email or password.');
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    if (!hasMfaPendingCookie()) {
      setPending(false);
      setError('Your sign-in attempt expired. Enter your password again.');
      setStep('password');
      return;
    }
    const res = await signIn('totp', {
      code: code.trim(),
      redirect: false,
      callbackUrl,
    });
    setPending(false);
    if (!res || res.error) {
      setError('Invalid code. Try again, or use a recovery code.');
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  function onOidcSignIn() {
    setError(null);
    void signIn('oidc', { callbackUrl });
  }

  if (step === 'totp') {
    return (
      <>
        <h1 className={styles.h1}>Two-factor code</h1>
        <p className={styles.subtitle}>
          Enter the 6-digit code from your authenticator app, or a recovery code.
        </p>
        <form className={styles.form} onSubmit={onTotpSubmit}>
          <div>
            <label className={styles.label} htmlFor="code">
              Code
            </label>
            <input
              id="code"
              type="text"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
              className={styles.input}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.submit} type="submit" disabled={pending}>
            {pending ? 'Verifying…' : 'Verify'}
          </button>
        </form>
        <div className={styles.switch}>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setStep('password');
              setCode('');
              setError(null);
            }}
            style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
          >
            ← Use a different account
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.h1}>Welcome back</h1>
      <p className={styles.subtitle}>Sign in to your notes.</p>

      {passwordAuth && (
        <form className={styles.form} onSubmit={onPasswordSubmit}>
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
              autoComplete="current-password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.submit} type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      {oidcAuth && (
        <>
          {passwordAuth && (
            <div className={styles.switch} style={{ margin: '14px 0' }}>
              or
            </div>
          )}
          <button
            type="button"
            className={styles.submit}
            style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--hair)' }}
            onClick={onOidcSignIn}
            disabled={pending}
          >
            Sign in with {oidcLabel}
          </button>
        </>
      )}

      {!passwordAuth && !oidcAuth && (
        <p className={styles.error}>No sign-in method is enabled on this instance.</p>
      )}

      {passwordAuth && (
        <div className={styles.switch}>
          <Link className={styles.link} href="/forgot-password">
            Forgot password?
          </Link>
        </div>
      )}
      {showSignupLink ? (
        <div className={styles.switch}>
          New here?{' '}
          <Link className={styles.link} href="/signup">
            Create an account
          </Link>
        </div>
      ) : passwordAuth ? (
        <div className={styles.switch}>
          Accounts on this instance are created by the operator.
        </div>
      ) : null}
    </>
  );
}

function hasMfaPendingCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c.startsWith('snb_mfa_pending='));
}
