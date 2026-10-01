import { NextResponse, type NextRequest } from 'next/server';
import { isNeonConfigured } from '@/lib/config';
import { getAuth } from '@/lib/auth/server';
export async function proxy(request: NextRequest) {
  if (!isNeonConfigured()) return NextResponse.next();
  const loginUrl = request.nextUrl.pathname === '/extension/connect'
    ? `/login?returnTo=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`
    : '/login';
  return getAuth().middleware({ loginUrl })(request);
}
// Neon can return Google OAuth to the origin root with a session verifier.
// Exchange it before HomePage redirects, or the verifier is lost and the
// account exists in Neon without an authenticated session in this browser.
export const config = { matcher: ['/', '/library/:path*', '/extension/connect'] };
