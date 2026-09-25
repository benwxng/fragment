import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { pool } from './db';
import { HttpError } from './validation';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL!));
export interface Identity { id: string; email: string; kind: 'web' | 'extension' }

export async function identify(request: Request): Promise<Identity> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to continue.');
  const token = authorization.slice(7);
  if (token.startsWith('refer_ext_')) {
    const { rows } = await pool.query(`select a.id, u.email from private.extension_sessions s
      join public.accounts a on a.id=s.user_id join neon_auth."user" u on u.id=a.auth_user_id
      where s.token_hash=$1 and s.expires_at>now() and u."emailVerified"=true
      and (not coalesce(u.banned,false) or u."banExpires"<now())`, [hash(token)]);
    if (!rows[0]) throw new HttpError(401, 'Your session expired. Sign in again.');
    return { ...rows[0], kind: 'extension' };
  }
  let sub: string | undefined;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: new URL(process.env.NEON_AUTH_BASE_URL!).origin,
      audience: new URL(process.env.NEON_AUTH_BASE_URL!).origin,
      algorithms: ['EdDSA'],
    });
    sub = payload.sub;
  } catch (error) {
    console.warn('JWT verification rejected', { code: (error as { code?: string }).code });
    throw new HttpError(401, 'Your session expired. Sign in again.');
  }
  if (!sub) throw new HttpError(401, 'Missing user identity.');
  const db = await pool.connect();
  try {
    await db.query('begin');
    const { rows: users } = await db.query(`select id,email,name,"emailVerified" from neon_auth."user"
      where id=$1 and (not coalesce(banned,false) or "banExpires"<now())`, [sub]);
    const user = users[0];
    if (!user) throw new HttpError(401, 'Account unavailable.');
    if (!user.emailVerified) throw new HttpError(403, 'Verify your email before accessing your library.');
    // Serializes first sign-in and prevents duplicate identities during concurrent requests.
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [user.email.toLowerCase()]);
    let { rows } = await db.query('select id from public.accounts where auth_user_id=$1', [sub]);
    if (!rows.length) {
      ({ rows } = await db.query(`update public.accounts set auth_user_id=$1
        where legacy_verified_email=$2 and auth_user_id is null returning id`, [sub, user.email.toLowerCase()]));
      if (!rows.length) ({ rows } = await db.query('insert into public.accounts(auth_user_id) values($1) returning id', [sub]));
    }
    await db.query('insert into public.profiles(id,display_name) values($1,$2) on conflict(id) do nothing', [rows[0].id, user.name?.slice(0,120) || null]);
    await db.query('commit');
    return { id: rows[0].id, email: user.email, kind: 'web' };
  } catch (error) { await db.query('rollback'); throw error; }
  finally { db.release(); }
}
