import type { CaptureInsert, CaptureRow } from '@refer/database';
import { getCloudConfig } from './config';
export class CloudError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type RemoteCapture = CaptureRow & { sync_revision: string };
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
export function getCloudClient(sessionToken?: string) {
  const config = getCloudConfig();
  if (!config) return null;
  async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
    const selectedToken = token ?? sessionToken;
    const session = selectedToken ? { token: selectedToken } : await storedSession();
    const response = await fetch(new URL(path, config!.apiUrl), {
      ...options, signal: AbortSignal.timeout(30_000), credentials: 'omit', redirect: 'error',
      headers: { ...options.headers, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && (await storedSession())?.token === session?.token) {
        await browser.storage.local.remove(SESSION_KEY);
      }
      throw new CloudError(response.status, result.error ?? 'Unable to connect to your library.');
    }
    return result as T;
  }
  return {
    auth: {
      async getSession() {
        if (!sessionToken && !await storedSession()) return { data: { session: null }, error: null };
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
        const session = await storedSession();
        try {
          if (session) await request('/extension/session',{ method:'DELETE' }, session.token);
        } finally {
          if (session && (await storedSession())?.token === session.token) await browser.storage.local.remove(SESSION_KEY);
        }
        return { error:null };
      },
    },
    async uploadScreenshot(id: string, blob: Blob, extension: string) {
      return request<{ path: string }>(`/screenshots/${encodeURIComponent(id)}.${extension}`,{
        method:'PUT', headers:{ 'Content-Type':blob.type }, body:blob,
      });
    },
    async upsertCapture(row: CaptureInsert, baseRevision: string | null) {
      return request<{ revision: string }>(`/captures/${encodeURIComponent(row.id!)}`,{
        method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ ...row, base_revision: baseRevision }),
      });
    },
    async listLibrary() {
      return request<{ captures: RemoteCapture[]; complete: boolean; userId: string }>('/library-sync');
    },
    async downloadScreenshot(id: string, extension: string): Promise<string> {
      const session = sessionToken ? { token: sessionToken } : await storedSession();
      if (!session) throw new Error('Sign in to sync your library.');
      const response = await fetch(new URL(`/screenshots/${encodeURIComponent(id)}.${extension}`, config.apiUrl), {
        signal: AbortSignal.timeout(30_000), credentials: 'omit', redirect: 'error', headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!response.ok) throw new CloudError(response.status, 'Unable to download a saved image.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024) throw new Error('Saved image exceeds the supported size.');
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      }
      return `data:image/${extension};base64,${btoa(binary)}`;
    },
    async deleteCapture(id: string) { await request(`/captures/${encodeURIComponent(id)}`, { method:'DELETE' }); },
  };
}

/** Pin every request in an operation to the account that started it. */
export async function getAccountClient() {
  const session = await storedSession();
  if (!session) return null;
  const client = getCloudClient(session.token);
  if (!client) throw new Error('Account saving is not configured in this build.');
  const { data, error } = await client.auth.getSession();
  if (error instanceof CloudError && error.status === 401) return null;
  if (error) throw error;
  return data.session ? { client, user: data.session.user } : null;
}
