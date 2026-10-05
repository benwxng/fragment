import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Exercise the installed Neon SDK, including its network-error normalization and cookie handling.
const context = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => '__Secure-neon-auth.session_token=fixture-session', set: context.set }),
  headers: async () => new Headers({ origin: 'https://glance.test', host: 'glance.test', cookie: '__Secure-neon-auth.session_token=fixture-session' }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('NEON_AUTH_BASE_URL', 'https://auth.example.test/auth');
  vi.stubEnv('NEON_AUTH_COOKIE_SECRET', 'test-only-secret-at-least-32-characters');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('recovers a dropped token connection with the same cookie, without clearing it', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValue(Response.json({ token: 'fresh-api-token' }));
  vi.stubGlobal('fetch', fetch);
  const { sessionToken } = await import('./session');
  expect(await sessionToken()).toBe('fresh-api-token');
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [, options] of fetch.mock.calls) expect(options.headers.Cookie).toContain('fixture-session');
  expect(context.set).not.toHaveBeenCalled();
});
it('does not report a persistent transport failure as an expired session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
  const { sessionToken } = await import('./session');
  await expect(sessionToken()).rejects.toMatchObject({ status: 503 });
  expect(context.set).not.toHaveBeenCalled();
});
it('refreshes the token when a rejected token still has a valid login session', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ message: 'Unauthorized' }, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ session: { id: 'fixture' }, user: { id: 'fixture-user' } }))
    .mockResolvedValueOnce(Response.json({ token: 'renewed-api-token' }));
  vi.stubGlobal('fetch', fetch);
  const { sessionToken } = await import('./session');
  expect(await sessionToken()).toBe('renewed-api-token');
  expect(fetch.mock.calls[1]![0]).toContain('get-session?disableCookieCache=true');
  expect(context.set).not.toHaveBeenCalled();
});
it('rejects a confirmed missing session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({}, { status: 401 }))
    .mockResolvedValueOnce(Response.json(null)));
  const { sessionToken } = await import('./session');
  await expect(sessionToken()).rejects.toMatchObject({ status: 401 });
});
it('does not cache one browser’s token for another request', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ token: 'account-a' }))
    .mockResolvedValueOnce(Response.json({ token: 'account-b' })));
  const { sessionToken } = await import('./session');
  expect(await sessionToken()).toBe('account-a');
  expect(await sessionToken()).toBe('account-b');
});
