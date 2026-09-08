import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@refer/database';

import { getSupabaseConfiguration } from '@/lib/config';

export function createClient() {
  const configuration = getSupabaseConfiguration();
  if (!configuration) throw new Error('Supabase is not configured.');

  return createBrowserClient<Database>(configuration.url, configuration.publishableKey);
}
