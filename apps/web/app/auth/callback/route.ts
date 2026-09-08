import { NextResponse } from 'next/server';

import { isSupabaseConfigured } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (!isSupabaseConfigured()) return NextResponse.redirect(new URL('/', requestUrl.origin));

  const code = requestUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login?authError=missing_code', requestUrl.origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? '/login?authError=confirmation_failed' : '/library', requestUrl.origin));
}
