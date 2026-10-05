'use client';

import { useActionState, useState } from 'react';

import { signIn, signUp } from '@/app/actions';
import { initialFormState } from '@/lib/form-state';
import { authClient } from '@/lib/auth/client';

export function AuthForm({ mode: initialMode, returnTo = '/library' }: { mode: 'signin' | 'signup'; returnTo?: string }) {
  const [mode, setMode] = useState(initialMode);
  return <>
    <div className="auth-heading">
      <h1 id="auth-title">{mode === 'signin' ? 'Welcome back' : 'Create account'}</h1>
      <p>{mode === 'signin' ? <>Sign in or <button type="button" className="auth-mode-switch" onClick={() => setMode('signup')}>sign up</button>.</>
        : <>Already have an account? <button type="button" className="auth-mode-switch" onClick={() => setMode('signin')}>Sign in</button>.</>}</p>
    </div>
    <AuthFields key={mode} mode={mode} returnTo={returnTo} />
  </>;
}

function AuthFields({ mode, returnTo }: { mode: 'signin' | 'signup'; returnTo: string }) {
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [googlePending, setGooglePending] = useState(false);
  const [googleError, setGoogleError] = useState('');
  async function googleSignIn() {
    setGooglePending(true);
    setGoogleError('');
    try {
      const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: new URL(returnTo, window.location.origin).href });
      if (error) throw new Error(error.message ?? 'Google sign-in failed.');
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : 'Google sign-in failed.');
    } finally { setGooglePending(false); }
  }

  return (
    <form action={formAction} className="auth-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      <button className="button button-secondary auth-submit" type="button" disabled={googlePending || pending} onClick={googleSignIn}>
        <svg className="google-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="#4285F4" d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.75 3.27-7.95Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.8l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 13.97A6.6 6.6 0 0 1 5.5 12c0-.68.12-1.34.34-1.97V7.19H2.18A10.9 10.9 0 0 0 1 12c0 1.78.43 3.46 1.18 4.81l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 5.5c1.62 0 3.06.56 4.21 1.64l3.16-3.16A10.55 10.55 0 0 0 12 1a11 11 0 0 0-9.82 6.19l3.66 2.84C6.71 7.43 9.14 5.5 12 5.5Z" />
        </svg>
        {googlePending ? 'Connecting to Google…' : 'Continue with Google'}
      </button>
      {googleError ? <p role="alert">{googleError}</p> : null}
      <div className="field">
        <label className="visually-hidden" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="Email" autoComplete="email" inputMode="email" required />
      </div>
      <div className="field">
        <label className="visually-hidden" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          minLength={8}
          required
        />
        {mode === 'signup' ? <p className="field-hint">Use at least 8 characters.</p> : null}
      </div>
      <p className={`form-message ${state.status}`} aria-live="polite">
        {state.message}
      </p>
      <button className="button button-primary auth-submit" type="submit" disabled={pending}>
        {pending ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : (mode === 'signin' ? 'Sign in' : 'Create account')}
      </button>
    </form>
  );
}
