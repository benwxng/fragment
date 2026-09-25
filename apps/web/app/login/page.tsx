import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppHeader } from '@/components/app-header';
import { GlaceAnimation } from '@/components/glace-animation';
import { AuthForm } from '@/components/auth-form';
import { ConfigurationScreen } from '@/components/configuration';
import { isNeonConfigured, safeReturnTo } from '@/lib/config';
import { getAuth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; authError?: string; returnTo?: string }> }) {
  if (!isNeonConfigured()) return <ConfigurationScreen />;
  const parameters = await searchParams;
  const returnTo = safeReturnTo(parameters.returnTo);
  const { data } = await getAuth().getSession();
  if (data?.user) redirect(data.user.emailVerified ? returnTo : `/verify-email?returnTo=${encodeURIComponent(returnTo)}`);
  const mode = parameters.mode === 'signup' ? 'signup' : 'signin';

  return (
    <div className="auth-page">
      <AppHeader />
      <main className="auth-main auth-main-with-art" id="main-content">
        <GlaceAnimation />
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-tabs" aria-label="Account action">
            <Link className={mode === 'signin' ? 'is-active' : ''} href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link>
            <Link className={mode === 'signup' ? 'is-active' : ''} href={`/login?mode=signup&returnTo=${encodeURIComponent(returnTo)}`}>Create account</Link>
          </div>
          <div className="auth-heading">
            <h1 id="auth-title">{mode === 'signin' ? 'Welcome back' : 'Create your library'}</h1>
            <p>{mode === 'signin' ? 'Sign in with the account connected to the extension.' : 'Use the same account in the extension to sync captures.'}</p>
          </div>
          {parameters.authError ? (
            <p className="auth-route-error" role="alert">Unable to confirm your email. Request a new confirmation link and try again.</p>
          ) : null}
          <AuthForm mode={mode} returnTo={returnTo} />
        </section>
      </main>
    </div>
  );
}
