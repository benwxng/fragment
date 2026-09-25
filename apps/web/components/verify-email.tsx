'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';

export function VerifyEmail({ email, returnTo }: { email: string; returnTo: string }) {
  const [message, setMessage] = useState('Send a verification code to confirm your email.');
  const [pending, setPending] = useState(false);
  async function send() {
    setPending(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' });
      setMessage(error?.message ?? 'Check your email for the verification code.');
    } catch { setMessage('Unable to send the code. Try again.'); }
    finally { setPending(false); }
  }
  return <form className="auth-form" onSubmit={async event => {
    event.preventDefault(); setPending(true);
    const otp = String(new FormData(event.currentTarget).get('otp') ?? '');
    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
      if (error) setMessage(error.message ?? 'Invalid verification code.');
      else window.location.assign(returnTo);
    } catch { setMessage('Unable to verify the code. Try again.'); }
    finally { setPending(false); }
  }}>
    <p>{email}</p>
    <button className="button button-secondary" type="button" disabled={pending} onClick={send}>Send verification code</button>
    <label className="field">Verification code<input name="otp" autoComplete="one-time-code" inputMode="numeric" required /></label>
    <p aria-live="polite">{message}</p>
    <button className="button button-primary" disabled={pending}>Verify email</button>
  </form>;
}
