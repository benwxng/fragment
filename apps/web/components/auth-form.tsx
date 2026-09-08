'use client';

import { useActionState } from 'react';

import { signIn, signUp } from '@/app/actions';
import { initialFormState } from '@/lib/form-state';

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="auth-form">
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
