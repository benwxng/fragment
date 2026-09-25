import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ redirect_uri?: string; challenge?: string; state?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams(params as Record<string,string>).toString();
  const returnTo = `/extension/connect?${query}`;
  const { data } = await getAuth().getSession();
  if (!data?.user) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  if (!data.user.emailVerified) redirect(`/verify-email?returnTo=${encodeURIComponent(returnTo)}`);
  async function connect() {
    'use server';
    const { code } = await api<{ code: string }>('/extension/authorize', {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ redirectUri: params.redirect_uri, challenge: params.challenge }),
    });
    const callback = new URL(params.redirect_uri!);
    callback.searchParams.set('code',code);
    callback.searchParams.set('state',params.state ?? '');
    redirect(callback.href);
  }
  return <main className="auth-main"><section className="auth-card"><h1>Connect Glace</h1>
    <p>Allow the Glace extension to sync captures and screenshots with the library for {data.user.email}?</p>
    <p>Only continue if you started this from your Glace extension.</p>
    <form action={connect}><button className="button button-primary">Connect extension</button></form>
  </section></main>;
}
