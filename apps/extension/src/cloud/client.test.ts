import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./config', () => ({ getCloudConfig: () => ({ apiUrl: 'https://api.example.com', siteUrl: 'https://example.com' }) }));
import { getAccountClient, getCloudClient } from './client';

let session: { token: string; expiresAt: string } | undefined;
const removed = vi.fn();
const launchWebAuthFlow = vi.fn();
beforeEach(() => {
  session = { token: 'account-a', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  removed.mockClear();
  launchWebAuthFlow.mockReset();
  vi.stubGlobal('browser', { identity: {
    getRedirectURL: () => 'https://fixture.chromiumapp.org/', launchWebAuthFlow,
  }, storage: { local: {
    get: async () => ({ 'refer-neon-session': session }),
    remove: async () => { removed(); session = undefined; },
    set: async (value: Record<string, typeof session>) => { session = value['refer-neon-session']; },
  } } });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['Authorization page could not be loaded.', 'Unable to open Glance sign-in'],
  ['The user did not approve access.', 'Sign-in was cancelled'],
])('explains a failed sign-in window: %s', async (reason, message) => {
  session = undefined;
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  launchWebAuthFlow.mockRejectedValue(new Error(reason));
  await expect(getCloudClient()!.auth.signIn()).rejects.toThrow(message);
  expect(fetch).not.toHaveBeenCalled();
  expect(session).toBeUndefined();
});

it('opens interactive sign-in and verifies the callback before storing a new session', async () => {
  session = undefined;
  const nextSession = { token: 'new-session', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  let authUrl: URL;
  launchWebAuthFlow.mockImplementation(async ({ url, interactive }) => {
    expect(interactive).toBe(true);
    authUrl = new URL(url);
    expect(authUrl.origin + authUrl.pathname).toBe('https://example.com/extension/connect');
    const callback = new URL(authUrl.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', authUrl.searchParams.get('state')!);
    callback.searchParams.set('code', 'one-time-code');
    return callback.href;
  });
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(nextSession))
    .mockResolvedValueOnce(Response.json({ user: { id: 'a', email: 'a@example.com' } }));
  vi.stubGlobal('fetch', fetch);
  await getCloudClient()!.auth.signIn();
  const exchange = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(exchange).toMatchObject({ code: 'one-time-code', redirectUri: 'https://fixture.chromiumapp.org/' });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(exchange.verifier));
  expect(authUrl!.searchParams.get('challenge')).toBe(Buffer.from(digest).toString('base64url'));
  expect(fetch.mock.calls[1]![1].headers.Authorization).toBe('Bearer new-session');
  expect(session).toEqual(nextSession);
});

it('rejects a sign-in callback for another flow without storing or exchanging credentials', async () => {
  session = undefined;
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  launchWebAuthFlow.mockResolvedValue('https://fixture.chromiumapp.org/?state=wrong&code=unexpected');
  await expect(getCloudClient()!.auth.signIn()).rejects.toThrow('could not be verified');
  expect(fetch).not.toHaveBeenCalled();
  expect(session).toBeUndefined();
});

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

it('retains the extension session through a temporary server failure and recovers', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: 'Account service unavailable' }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ user: { id: 'a', email: 'a@example.com' } }));
  vi.stubGlobal('fetch', fetch);
  await expect(getAccountClient()).rejects.toMatchObject({ status: 503 });
  expect(removed).not.toHaveBeenCalled();
  expect(session?.token).toBe('account-a');
  expect(await getAccountClient()).toMatchObject({ user: { id: 'a' } });
});
