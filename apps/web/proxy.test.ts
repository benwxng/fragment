import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

vi.mock('@/lib/config', () => ({ isNeonConfigured: () => true }));
vi.mock('@/lib/auth/server', async () => {
  const { createNeonAuth } = await import('@neondatabase/auth/next/server');
  const auth = createNeonAuth({
    baseUrl: 'https://auth.example.com/auth',
    cookies: { secret: 'test-cookie-secret-at-least-32-characters-long' },
  });
  return { getAuth: () => auth };
});

import { config, proxy } from './proxy';

afterEach(() => vi.unstubAllGlobals());

describe('Google OAuth callback routing', () => {
  it.each(['/', '/library', '/library/example', '/extension/connect'])(
    'handles session verification before the %s page renders', (path) => {
      expect(unstable_doesMiddlewareMatch({
        config, nextConfig: {}, url: `${path}?neon_auth_session_verifier=test-verifier`,
      })).toBe(true);
    },
  );

  it.each(['/login', '/api/auth/sign-in/social', '/_next/static/app.js', '/brand/rive.wasm'])(
    'keeps public login resources outside the protected matcher: %s', (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    },
  );

  it('exchanges a root callback through Neon and forwards its session cookie', async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({ session: null, user: null }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': '__Secure-neon-auth.session_token=test-session; Path=/; HttpOnly; Secure; SameSite=Lax',
      },
    }));
    vi.stubGlobal('fetch', upstream);
    const response = await proxy(new NextRequest('http://localhost:3000/?neon_auth_session_verifier=test-verifier', {
      headers: { cookie: '__Secure-neon-auth.session_challenge=test-challenge' },
    }));
    expect(upstream).toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
    expect(response.headers.get('set-cookie')).toContain('session_token=test-session');
  });

  it.each(['/', '/library', '/library/example', '/extension/connect'])('lets the page/API at %s decide auth failures without a middleware login redirect', async (path) => {
    const upstream = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', upstream);
    const response = await proxy(new NextRequest('http://localhost:3000' + path));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('preserves the extension handshake for its authenticated page handler', async () => {
    const returnTo = '/extension/connect?redirect_uri=https%3A%2F%2Ftest.chromiumapp.org%2F&challenge=test-challenge&state=test-state';
    const response = await proxy(new NextRequest(`http://localhost:3000${returnTo}`));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
