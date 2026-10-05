import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, errors } from 'jose';

const db = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock('./db', () => ({ pool: db }));
const issuer = 'https://auth.example.test';
const keys = await generateKeyPair('EdDSA');
const jwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'EdDSA' };
async function token(expiry = '5m') {
  return new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: jwk.kid })
    .setSubject('test-user').setIssuer(issuer).setAudience(issuer).setIssuedAt()
    .setExpirationTime(expiry).sign(keys.privateKey);
}
async function identify(value: string) {
  const { identify } = await import('./auth');
  return identify(new Request('https://api.example.test/me', { headers: { authorization: `Bearer ${value}` } }));
}
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('NEON_AUTH_BASE_URL', issuer + '/auth');
  vi.stubEnv('NEON_AUTH_JWKS_URL', issuer + '/auth/jwks');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('authentication failure classification', () => {
  it.each([
    new TypeError('fetch failed'), new errors.JWKSTimeout(),
  ])('keeps a signing-key connection failure temporary (%s)', async failure => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));
    await expect(identify(await token())).rejects.toMatchObject({ status: 503 });
    expect(db.connect).not.toHaveBeenCalled();
  });
  it('keeps an upstream key-server HTTP failure temporary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })));
    await expect(identify(await token())).rejects.toMatchObject({ status: 503 });
  });
  it('rejects a genuinely expired JWT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ keys: [jwk] })));
    await expect(identify(await token('-1m'))).rejects.toMatchObject({ status: 401 });
  });
  it('rejects a malformed token without fetching keys', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(identify('invalid')).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('recovers after a key-server outage with the same valid JWT', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(Response.json({ keys: [jwk] }));
    vi.stubGlobal('fetch', fetch);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from neon_auth')) return { rows: [{ id: 'test-user', email: 'test@example.test', emailVerified: true }] };
      if (sql.includes('from public.accounts')) return { rows: [{ id: 'test-account' }] };
      return { rows: [] };
    });
    const release = vi.fn();
    db.connect.mockResolvedValue({ query, release });
    const value = await token();
    await expect(identify(value)).rejects.toMatchObject({ status: 503 });
    await expect(identify(value)).resolves.toMatchObject({ id: 'test-account', kind: 'web' });
    expect(release).toHaveBeenCalledOnce();
  });
  it('does not erase or alter an extension session on a database outage', async () => {
    db.query.mockRejectedValue(new Error('Database temporarily unavailable'));
    await expect(identify('refer_ext_example')).rejects.toThrow('Database temporarily unavailable');
    expect(db.query).toHaveBeenCalledOnce();
    expect(db.query.mock.calls[0]?.[0]).toContain('select');
  });
});
