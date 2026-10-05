import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { GlaceAnimation } from '@/components/glace-animation';
import { AuthForm } from '@/components/auth-form';
import { ConfigurationScreen } from '@/components/configuration';
import { isNeonConfigured, safeReturnTo } from '@/lib/config';
import { getAuth } from '@/lib/auth/server';
import { SessionError } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; authError?: string; returnTo?: string; reauth?: string }> }) {
  if (!isNeonConfigured()) return <ConfigurationScreen />;
  const parameters = await searchParams;
  const returnTo = safeReturnTo(parameters.returnTo);
  const { data, error } = await getAuth().getSession();
  if (error && error.status !== 401) throw new SessionError(503);
  if (data?.user && parameters.reauth !== '1') redirect(data.user.emailVerified ? returnTo : `/verify-email?returnTo=${encodeURIComponent(returnTo)}`);
  const mode = parameters.mode === 'signup' ? 'signup' : 'signin';

  return (
    <div className="auth-page">
      <main className="auth-main auth-main-with-art" id="main-content">
        <section className="auth-card" aria-labelledby="auth-title">
          {parameters.authError ? (
            <p className="auth-route-error" role="alert">Unable to confirm your email. Request a new confirmation link and try again.</p>
          ) : null}
          <AuthForm mode={mode} returnTo={returnTo} />
        </section>
        <GlaceAnimation />
      </main>
    </div>
  );
}
