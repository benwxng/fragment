import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ token: vi.fn(), getSession: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getAuth: () => mocks }));
import { GET, PUT, DELETE } from './[...path]/route';

const id = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc9';
const context = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) });
const upstream = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEON_FUNCTION_API_BASE_URL', 'https://api.example.test');
  mocks.token.mockResolvedValue({ data: { token: 'server-secret' } });
  mocks.getSession.mockResolvedValue({ data: null, error: null });
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('shared library web transport', () => {
  it.each([429, 500, 502, 503])('reports auth service failure %s as temporary, not a sign-out', async (status) => {
    mocks.token.mockResolvedValue({ data: null, error: { status, message: 'Service unavailable' } });
    const response = await GET(new Request('https://glance.test/api/library/me'), context('me'));
    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([401, 403])('still rejects invalid sessions (%s)', async (status) => {
    mocks.token.mockResolvedValue({ data: null, error: { status } });
    const response = await GET(new Request('https://glance.test/api/library/me'), context('me'));
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects an unauthenticated read without contacting the backend', async () => {
    mocks.token.mockResolvedValue({ data: null });
    const response = await GET(new Request('https://glance.test/api/library/me'), context('me'));
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('recovers a temporary token failure without requiring another login', async () => {
    mocks.token.mockResolvedValueOnce({ data: null, error: { status: 502 } });
    upstream.mockResolvedValue(Response.json({ user: { id: 'owner' } }));
    const response = await GET(new Request('https://glance.test/api/library/me'), context('me'));
    expect(response.status).toBe(200);
    expect(mocks.token).toHaveBeenCalledTimes(2);
  });
  it('does not sign out a valid browser session when the backend rejects its JWT', async () => {
    mocks.getSession.mockResolvedValue({ data: { user: { id: 'owner' } } });
    upstream.mockResolvedValue(Response.json({ error: 'Session expired' }, { status: 401 }));
    const response = await GET(new Request('https://glance.test/api/library/me'), context('me'));
    expect(response.status).toBe(503);
    expect(mocks.getSession).toHaveBeenCalledWith({ query: { disableCookieCache: 'true' } });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('keeps a backend rejection temporary when the browser session cannot be checked', async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: { status: 502 } });
    upstream.mockResolvedValue(Response.json({}, { status: 401 }));
    expect((await GET(new Request('https://glance.test/api/library/me'), context('me'))).status).toBe(503);
  });
  it('still clears an explicitly ended browser session after a backend rejection', async () => {
    upstream.mockResolvedValue(Response.json({}, { status: 401 }));
    expect((await GET(new Request('https://glance.test/api/library/me'), context('me'))).status).toBe(401);
  });
  it('does not replay a mutation when the owner check fails', async () => {
    mocks.getSession.mockResolvedValue({ data: { user: { id: 'owner' } } });
    upstream.mockResolvedValue(Response.json({}, { status: 401 }));
    const response = await DELETE(new Request('https://glance.test/api/library/captures/' + id, {
      method: 'DELETE', headers: { origin: 'https://glance.test', 'x-library-owner': 'owner' },
    }), context('captures/' + id));
    expect(response.status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0]?.[1].method).toBeUndefined();
  });
  it('reports a network failure without inventing a sign-out', async () => {
    upstream.mockRejectedValue(new TypeError('fetch failed'));
    expect((await GET(new Request('https://glance.test/api/library/me'), context('me'))).status).toBe(503);
  });
  it('does not proxy arbitrary API paths', async () => {
    const response = await GET(new Request('https://glance.test/api/library/extension/session'), context('extension/session'));
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects cross-origin mutations before authenticating', async () => {
    const response = await DELETE(new Request('https://glance.test/api/library/captures/' + id, {
      method: 'DELETE', headers: { origin: 'https://other.test', 'x-library-owner': 'owner' },
    }), context('captures/' + id));
    expect(response.status).toBe(403);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it('requires an owner for account data', async () => {
    const response = await GET(new Request('https://glance.test/api/library/library-sync'), context('library-sync'));
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects a stale account before deleting or restoring a reference', async () => {
    upstream.mockResolvedValue(Response.json({ user: { id: 'other-account' } }));
    const response = await DELETE(new Request('https://glance.test/api/library/captures/' + id, {
      method: 'DELETE', headers: { origin: 'https://glance.test', 'x-library-owner': 'owner' },
    }), context('captures/' + id));
    expect(response.status).toBe(409);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('forwards authenticated image bytes without exposing the session token', async () => {
    upstream.mockResolvedValueOnce(Response.json({ user: { id: 'owner' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([137,80,78,71]), { headers: { 'Content-Type': 'image/png' } }));
    const response = await GET(new Request('https://glance.test/api/library/screenshots/' + id + '.png', {
      headers: { 'x-library-owner': 'owner' },
    }), context('screenshots/' + id + '.png'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('authorization')).toBeNull();
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137,80,78,71]);
    expect(upstream.mock.calls[1]?.[1].headers.Authorization).toBe('Bearer server-secret');
  });
  it('forwards a restore to the pinned account using the authenticated token', async () => {
    upstream.mockResolvedValueOnce(Response.json({ user: { id: 'owner' } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const body = JSON.stringify({ id, snapshot: {}, base_revision: null });
    const response = await PUT(new Request('https://glance.test/api/library/captures/' + id, {
      method: 'PUT', headers: { origin: 'https://glance.test', 'x-library-owner': 'owner', 'content-type': 'application/json' }, body,
    }), context('captures/' + id));
    expect(response.status).toBe(200);
    const options = upstream.mock.calls[1]?.[1];
    expect(options.method).toBe('PUT');
    expect(new TextDecoder().decode(options.body)).toBe(body);
  });
});
