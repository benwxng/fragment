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

const owner = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc9';
const id = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bca';
function snapshot() {
  return { user: { id: owner, email: 'test@example.com' }, userId: owner, complete: true, captures: [{
    id, user_id: owner, updated_at: '2026-10-05T00:00:00Z', captured_at: '2026-10-05T00:00:00Z', facets: ['typography'],
    screenshot_path: `${owner}/${id}.png`, source_url: 'https://example.test', source_origin: 'https://example.test',
    snapshot: { snapshotVersion: 1, source: {}, element: { semantic: { tagName: 'DIV' }, typography: {}, colors: {} },
      screenshot: { width: 800, height: 600 } },
  }] };
}
it('loads account and metadata in one request without downloading any images', async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json(snapshot()));
  vi.stubGlobal('fetch', fetch);
  const adapter = webLibraryAdapter();
  expect((await adapter.request({ type: 'get-cloud-state' })).ok).toBe(true);
  const result = await adapter.request({ type: 'list-references' });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.references?.[0]?.screenshot?.dataUrl).toBeNull();
  expect(adapter.imageUrl!(result.references![0]!)).toBe(`/api/library/screenshots/${id}.png?owner=${owner}`);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]![0]).toBe('/api/library/bootstrap');
  await adapter.request({ type: 'get-cloud-state' });
  await adapter.request({ type: 'list-references' });
  expect(fetch).toHaveBeenCalledTimes(2); // Each refresh still authenticates.
});
it('pins image URLs to the account and supports an already-loaded view after remount', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(snapshot())));
  const adapter = webLibraryAdapter();
  const result = await adapter.request({ type: 'list-references' });
  if (!result.ok) throw new Error('Fixture failed');
  const reference = result.references![0]!;
  const remount = webLibraryAdapter();
  remount.viewState = { account: { userId: owner } as any, references: result.references };
  expect(remount.imageUrl!(reference)).toBe(adapter.imageUrl!(reference));
  expect(adapter.imageUrl!({ ...reference, screenshot: { ...reference.screenshot!, storagePath: 'other-account/image.png' } })).toBeUndefined();
});
it.each([false, true])('preserves screenshot bytes for delete/undo without downloading the rest of the gallery (remount: %s)', async (remount) => {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    if (url.endsWith('/bootstrap')) return Response.json(snapshot());
    if (url.endsWith('/me')) return Response.json({ user: snapshot().user });
    if (url.includes('/screenshots/') && !options.method) return new Response(new Uint8Array([137, 80, 78, 71]));
    return Response.json({ ok: true });
  }));
  let adapter = webLibraryAdapter();
  const listed = await adapter.request({ type: 'list-references' });
  if (!listed.ok) throw new Error('Fixture failed');
  const reference = listed.references![0]!;
  if (remount) {
    adapter = webLibraryAdapter();
    adapter.viewState = { references: listed.references, account: { userId: owner } as any };
  }
  expect(await adapter.request({ type: 'delete-reference', id, expectedUserId: owner })).toEqual({ ok: true });
  expect(await adapter.request({ type: 'save-reference', reference, expectedUserId: owner })).toEqual({ ok: true });
  expect(calls.filter(call => call.url.includes('/screenshots/') && !call.options.method)).toHaveLength(1);
  const imageUpload = calls.find(call => call.url.includes('/screenshots/') && call.options.method === 'PUT');
  expect(imageUpload?.options.body).toBeInstanceOf(Blob);
  expect([...new Uint8Array(await (imageUpload!.options.body as Blob).arrayBuffer())]).toEqual([137, 80, 78, 71]);
});
