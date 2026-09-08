import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppHeader } from '@/components/app-header';
import { AuthForm } from '@/components/auth-form';
import { ConfigurationScreen } from '@/components/configuration';
import { isSupabaseConfigured } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; authError?: string }> }) {
  if (!isSupabaseConfigured()) return <ConfigurationScreen />;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect('/library');

  const parameters = await searchParams;
  const mode = parameters.mode === 'signup' ? 'signup' : 'signin';

  return (
    <div className="auth-page">
      <AppHeader />
      <main className="auth-main" id="main-content">
        <section className="auth-intro">
          <p className="eyebrow">Private design archive</p>
          <h1>Keep what catches your eye.</h1>
          <p className="lede">Your typography, component, color, and layout references—captured with their original context.</p>
        </section>
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-tabs" aria-label="Account action">
            <Link className={mode === 'signin' ? 'is-active' : ''} href="/login">Sign in</Link>
            <Link className={mode === 'signup' ? 'is-active' : ''} href="/login?mode=signup">Create account</Link>
          </div>
          <div className="auth-heading">
            <h2 id="auth-title">{mode === 'signin' ? 'Welcome back' : 'Create your library'}</h2>
            <p>{mode === 'signin' ? 'Sign in with the account connected to the extension.' : 'Use the same account in the extension to sync captures.'}</p>
          </div>
          {parameters.authError ? (
            <p className="auth-route-error" role="alert">Unable to confirm your email. Request a new confirmation link and try again.</p>
          ) : null}
          <AuthForm mode={mode} />
        </section>
      </main>
    </div>
  );
}
