'use client';

import { useActionState, useState } from 'react';

import { signIn, signUp } from '@/app/actions';
import { initialFormState } from '@/lib/form-state';
import { authClient } from '@/lib/auth/client';

export function AuthForm({ mode, returnTo = '/library' }: { mode: 'signin' | 'signup'; returnTo?: string }) {
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
        {googlePending ? 'Connecting to Google…' : 'Continue with Google'}
      </button>
      {googleError ? <p role="alert">{googleError}</p> : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          minLength={8}
          required
        />
        <p className="field-hint" style={{ visibility: mode === 'signup' ? 'visible' : 'hidden' }} aria-hidden={mode !== 'signup'}>
          Use at least 8 characters.
        </p>
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
