import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@refer/database';
import { getCloudConfig } from './config';

const AUTH_STORAGE_PREFIX = 'refer-cloud-auth';
let client: SupabaseClient<Database> | null | undefined;

const extensionStorage = {
  async getItem(key: string): Promise<string | null> {
    const values = await browser.storage.local.get(key);
    return typeof values[key] === 'string' ? values[key] : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  },
};

/** The client exists only in the extension background context. */
export function getCloudClient(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;
  const config = getCloudConfig();
  if (!config) {
    client = null;
    return client;
  }

  client = createClient<Database>(config.url, config.publishableKey, {
    auth: {
      storage: extensionStorage,
      storageKey: AUTH_STORAGE_PREFIX,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'refer-extension/0.1' },
    },
  });
  return client;
}
