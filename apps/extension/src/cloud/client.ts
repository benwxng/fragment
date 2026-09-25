import type { CaptureInsert } from '@refer/database';
import { getCloudConfig } from './config';
const SESSION_KEY = 'refer-neon-session';
interface Session { token: string; expiresAt: string }
interface User { id: string; email: string }
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function storedSession(): Promise<Session | null> {
  const value = (await browser.storage.local.get(SESSION_KEY))[SESSION_KEY] as Session | undefined;
  if (!value?.token || !(Date.parse(value.expiresAt) > Date.now())) {
    if (value) await browser.storage.local.remove(SESSION_KEY);
    return null;
  }
  return value;
}
export function getCloudClient() {
  const config = getCloudConfig();
  if (!config) return null;
  async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
    const session = token ? { token } : await storedSession();
    const response = await fetch(new URL(path, config!.apiUrl), {
      ...options, credentials: 'omit', redirect: 'error',
      headers: { ...options.headers, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) await browser.storage.local.remove(SESSION_KEY);
      throw new Error(result.error ?? 'Unable to connect to your library.');
    }
    return result as T;
  }
  return {
    auth: {
      async getSession() {
        if (!await storedSession()) return { data: { session: null }, error: null };
        try {
          const { user } = await request<{ user: User }>('/me');
          return { data: { session: { user } }, error: null };
        } catch (error) { return { data: { session: null }, error: error as Error }; }
      },
      async signIn() {
        const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
        const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
        const redirectUri = browser.identity.getRedirectURL();
        const url = new URL('/extension/connect',config.siteUrl);
        url.search = new URLSearchParams({ redirect_uri:redirectUri, challenge, state }).toString();
        const result = await browser.identity.launchWebAuthFlow({ url:url.href, interactive:true });
        if (!result) throw new Error('Sign-in was cancelled.');
        const callback = new URL(result);
        const expected = new URL(redirectUri);
        if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.searchParams.get('state') !== state) {
          throw new Error('The sign-in response could not be verified.');
        }
        const session = await request<Session>('/extension/exchange', {
          method:'POST', headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify({ code:callback.searchParams.get('code'), verifier, redirectUri }),
        });
        const { user } = await request<{ user: User }>('/me',{},session.token);
        await browser.storage.local.set({ [SESSION_KEY]: session });
        return { data: { user }, error: null };
      },
      async signOut(_options?: { scope: string }) {
        try {
          if (await storedSession()) await request('/extension/session',{ method:'DELETE' });
        } finally { await browser.storage.local.remove(SESSION_KEY); }
        return { error:null };
      },
    },
    async uploadScreenshot(id: string, blob: Blob, extension: string) {
      return request<{ path: string }>(`/screenshots/${encodeURIComponent(id)}.${extension}`,{
        method:'PUT', headers:{ 'Content-Type':blob.type }, body:blob,
      });
    },
    async upsertCapture(row: CaptureInsert) {
      await request(`/captures/${encodeURIComponent(row.id!)}`,{
        method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(row),
      });
    },
    async deleteCapture(id: string) { await request(`/captures/${encodeURIComponent(id)}`, { method:'DELETE' }); },
  };
}
