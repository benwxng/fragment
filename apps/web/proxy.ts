import { NextResponse, type NextRequest } from 'next/server';
import { isNeonConfigured } from '@/lib/config';
import { getAuth } from '@/lib/auth/server';
export async function proxy(request: NextRequest) {
  if (!isNeonConfigured()) return NextResponse.next();
  return getAuth().middleware({ loginUrl: '/login' })(request);
}
export const config = { matcher: ['/library/:path*'] };
