import { createServerClient } from '@supabase/ssr';
import type { Database } from '@refer/database';
import { NextResponse, type NextRequest } from 'next/server';

import { getSupabaseConfiguration } from '@/lib/config';

export async function updateSession(request: NextRequest) {
  const configuration = getSupabaseConfiguration();
  if (!configuration) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(configuration.url, configuration.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}
