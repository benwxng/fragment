import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/app/actions', () => ({ signOut: vi.fn() }));
import { webLibraryAdapter } from './library-adapter';

afterEach(() => vi.unstubAllGlobals());

it('shows sign-in for an ended session without redirecting into a login loop', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { assign } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  const result = await webLibraryAdapter().request({ type: 'get-cloud-state' });
  expect(result).toMatchObject({ ok: true, cloudState: { authStatus: 'signed-out', userId: null } });
  expect(assign).not.toHaveBeenCalled();
});

it('does not turn a temporary account connection failure into a sign-out', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Connection unavailable' }, { status: 503 })));
  expect(await webLibraryAdapter().request({ type: 'get-cloud-state' })).toEqual({ ok: false, error: 'Connection unavailable' });
});

it('invalidates loaded data when the session expires while reading references', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ user: { id: 'owner', email: 'test@example.com' } }))
    .mockResolvedValueOnce(new Response('{}', { status: 401 })));
  expect(await webLibraryAdapter().request({ type: 'list-references' })).toMatchObject({ ok: false, resetLibrary: true });
});
