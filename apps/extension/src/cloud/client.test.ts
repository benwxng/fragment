import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./config', () => ({ getCloudConfig: () => ({ apiUrl: 'https://api.example.com', siteUrl: 'https://example.com' }) }));
import { getAccountClient, getCloudClient } from './client';

let session: { token: string; expiresAt: string } | undefined;
const removed = vi.fn();
beforeEach(() => {
  session = { token: 'account-a', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  removed.mockClear();
  vi.stubGlobal('browser', { storage: { local: {
    get: async () => ({ 'refer-neon-session': session }),
    remove: async () => { removed(); session = undefined; },
  } } });
});
afterEach(() => vi.unstubAllGlobals());

it('pins ongoing account operations to their original session', async () => {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ user: { id: 'a', email: 'a@example.com' } })));
  vi.stubGlobal('fetch', fetchMock);
  const account = await getAccountClient();
  session = { token: 'account-b', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  await account!.client.listLibrary();
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ headers: { Authorization: 'Bearer account-a' } });
});

it('a stale unauthorized request cannot erase a newer account session', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user: { id: 'a' } }))));
  const account = await getAccountClient();
  session = { token: 'account-b', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'expired' }), { status: 401 })));
  await expect(account!.client.listLibrary()).rejects.toThrow('expired');
  expect(removed).not.toHaveBeenCalled();
  expect(session?.token).toBe('account-b');
});

it('clears the local session even when remote sign-out fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Offline'); }));
  await expect(getCloudClient()!.auth.signOut()).rejects.toThrow('Offline');
  expect(session).toBeUndefined();
});
