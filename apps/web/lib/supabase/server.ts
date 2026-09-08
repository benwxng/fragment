import { createServerClient } from '@supabase/ssr';
import type { Database } from '@refer/database';
import { cookies } from 'next/headers';

import { getSupabaseConfiguration } from '@/lib/config';

export async function createClient() {
  const configuration = getSupabaseConfiguration();
  if (!configuration) throw new Error('Supabase is not configured.');

  const cookieStore = await cookies();

  return createServerClient<Database>(configuration.url, configuration.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. The proxy refreshes sessions.
        }
      },
    },
  });
}
