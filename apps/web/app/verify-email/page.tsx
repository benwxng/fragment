import { redirect } from 'next/navigation';
import { pageSession } from '@/lib/auth/page-session';
import { safeReturnTo } from '@/lib/config';
import { VerifyEmail } from '@/components/verify-email';
import { signOut } from '@/app/actions';
export const dynamic = 'force-dynamic';
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const data = await pageSession(returnTo);
  if (data.user.emailVerified) redirect(returnTo);
  return <main className="auth-main"><section className="auth-card"><h1>Verify your email</h1>
    <VerifyEmail email={data.user.email} returnTo={returnTo} />
    <form action={signOut}><button className="button button-secondary">Use another account</button></form>
  </section></main>;
}
