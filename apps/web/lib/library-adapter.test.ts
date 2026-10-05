import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/app/actions', () => ({ signOut: vi.fn() }));
import { webLibraryAdapter } from './library-adapter';

afterEach(() => vi.unstubAllGlobals());

it('redirects an ended session to reauthentication with the original destination', async () => {
  const replace = vi.fn();
  vi.stubGlobal('window', { location: { replace, pathname: '/library/saved-id', search: '' } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  const result = await webLibraryAdapter().request({ type: 'get-cloud-state' });
  expect(result).toEqual({ ok: true, redirecting: true });
  expect(replace).toHaveBeenCalledWith('/login?reauth=1&returnTo=%2Flibrary%2Fsaved-id');
});

it('does not turn a temporary account connection failure into a sign-out', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Connection unavailable' }, { status: 503 })));
  expect(await webLibraryAdapter().request({ type: 'get-cloud-state' })).toEqual({ ok: false, error: 'Connection unavailable' });
});

it('redirects when the session expires while reading references', async () => {
  const replace = vi.fn();
  vi.stubGlobal('window', { location: { replace, pathname: '/library', search: '' } });
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ user: { id: 'owner', email: 'test@example.com' } }))
    .mockResolvedValueOnce(new Response('{}', { status: 401 })));
  expect(await webLibraryAdapter().request({ type: 'list-references' })).toEqual({ ok: true, redirecting: true });
  expect(replace).toHaveBeenCalledWith('/login?reauth=1&returnTo=%2Flibrary');
});

it('marks web sign-in as a redirect instead of an account-status response', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { assign } });
  expect(await webLibraryAdapter().request({ type: 'cloud-sign-in' })).toEqual({ ok: true, redirecting: true });
  expect(assign).toHaveBeenCalledWith('/login');
});
