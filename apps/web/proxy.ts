import { NextResponse, type NextRequest } from 'next/server';
import { isNeonConfigured } from '@/lib/config';
import { getAuth } from '@/lib/auth/server';
export async function proxy(request: NextRequest) {
  if (!isNeonConfigured()) return NextResponse.next();
  // Library pages contain only the public UI shell. Their account data is
  // authenticated by /api/library on every request. Avoid treating an auth
  // service outage during navigation or Fast Refresh as a sign-out.
  // OAuth callbacks must still pass through Neon to exchange the verifier.
  if ((request.nextUrl.pathname === '/library' || request.nextUrl.pathname.startsWith('/library/'))
    && !request.nextUrl.searchParams.has('neon_auth_session_verifier')) return NextResponse.next();
  const loginUrl = request.nextUrl.pathname === '/extension/connect'
    ? `/login?returnTo=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`
    : '/login';
  return getAuth().middleware({ loginUrl })(request);
}
// Neon can return Google OAuth to the origin root with a session verifier.
// Exchange it before HomePage redirects, or the verifier is lost and the
// account exists in Neon without an authenticated session in this browser.
export const config = { matcher: ['/', '/library/:path*', '/extension/connect'] };
