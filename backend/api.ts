import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pool, asOwner } from './db';
import { identify, hash, randomToken } from './auth';
import { HttpError, requireUuid, screenshotKey, validateRedirect, validateChallenge, limitedBody, jsonBody } from './validation';

const s3 = new S3Client({ forcePathStyle: true });
const Bucket = 'uploads';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (path === '/' && request.method === 'GET') return json({ service: 'Refer API', status: 'ok', version: 2 });

  if (path === '/extension/exchange' && request.method === 'POST') {
    const body = await jsonBody(request);
    if (typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.code)
      || typeof body.verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(body.verifier)) {
      throw new HttpError(400, 'Invalid sign-in code.');
    }
    const redirect = validateRedirect(body.redirectUri);
    const challenge = createHash('sha256').update(body.verifier).digest('base64url');
    const db = await pool.connect();
    try {
      await db.query('begin');
      const { rows } = await db.query(`delete from private.extension_codes
        where code_hash=$1 and challenge=$2 and redirect_uri=$3 and expires_at>now() returning user_id`,
      [hash(body.code), challenge, redirect]);
      if (!rows[0]) throw new HttpError(401, 'Sign-in code expired or already used.');
      const token = `refer_ext_${randomToken()}`;
      const { rows: sessions } = await db.query(`insert into private.extension_sessions(token_hash,user_id)
        values($1,$2) returning expires_at`, [hash(token), rows[0].user_id]);
      await db.query('commit');
      return json({ token, expiresAt: sessions[0].expires_at });
    } catch (error) { await db.query('rollback'); throw error; }
    finally { db.release(); }
  }

  const user = await identify(request);
  if (path === '/me' && request.method === 'GET') return json({ user: { id: user.id, email: user.email } });
  if (path === '/extension/authorize' && request.method === 'POST') {
    if (user.kind !== 'web') throw new HttpError(403, 'Sign in on the website to connect an extension.');
    const body = await jsonBody(request);
    const redirect = validateRedirect(body.redirectUri);
    const challenge = validateChallenge(body.challenge);
    const code = randomToken();
    await pool.query('delete from private.extension_codes where expires_at<now()');
    await pool.query(`insert into private.extension_codes(code_hash,user_id,challenge,redirect_uri)
      values($1,$2,$3,$4)`, [hash(code),user.id,challenge,redirect]);
    return json({ code });
  }
  if (path === '/extension/session' && request.method === 'DELETE') {
    await pool.query('delete from private.extension_sessions where token_hash=$1', [hash(request.headers.get('authorization')!.slice(7))]);
    return json({ ok: true });
  }
  // A single SQL snapshot is complete: clients may reconcile deletions only after
  // receiving this explicit marker. Never truncate this response.
  if (path === '/library-sync' && request.method === 'GET') {
    const captures = await asOwner(user.id, async db => (await db.query(
      'select *, updated_at::text as sync_revision from public.captures order by captured_at desc, id',
    )).rows);
    return json({ captures, complete: true, userId: user.id });
  }
  if (path === '/captures' && request.method === 'GET') {
    const rows = await asOwner(user.id, async db => (await db.query('select * from public.captures order by captured_at desc, id')).rows);
    const captures = await Promise.all(rows.map(async row => ({ ...row, screenshot_url: row.screenshot_path
      ? await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: row.screenshot_path }), { expiresIn: 3600 }) : null })));
    return json({ captures });
  }
  const captureMatch = /^\/captures\/([^/]+)$/.exec(path);
  if (captureMatch) {
    const id = requireUuid(captureMatch[1]);
    if (request.method === 'GET') {
      const row = await asOwner(user.id, async db => (await db.query('select * from public.captures where id=$1',[id])).rows[0]);
      if (!row) throw new HttpError(404, 'Reference not found.');
      const screenshot_url = row.screenshot_path
        ? await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: row.screenshot_path }), { expiresIn: 3600 }) : null;
      return json({ capture: { ...row, screenshot_url } });
    }
    if (request.method === 'PUT') {
      const body = await jsonBody(request);
      if (body.user_id !== undefined && body.user_id !== user.id) throw new HttpError(403, 'Reference belongs to another account.');
      if (body.id !== undefined && body.id !== id) throw new HttpError(400, 'Reference ID mismatch.');
      if (body.screenshot_path != null && !['png','webp'].some(ext => screenshotKey(user.id,id,ext) === body.screenshot_path)) {
        throw new HttpError(400, 'Invalid screenshot path.');
      }
      if (!body.snapshot || typeof body.snapshot !== 'object' || Array.isArray(body.snapshot)
        || !Array.isArray(body.facets) || body.facets.length === 0
        || body.facets.some(f => !['typography','component','color','layout'].includes(String(f)))
        || typeof body.source_url !== 'string' || typeof body.source_origin !== 'string') throw new HttpError(400, 'Invalid reference.');
      const columns = ['id','user_id','facets','source_url','source_origin','page_title','element_label',
        'primary_font_family','text_color','background_color','screenshot_path','snapshot_version','snapshot',
        'note','favorite','collection_id','captured_at'];
      const values = [id,user.id,body.facets,body.source_url,body.source_origin,body.page_title??'',body.element_label??'',
        body.primary_font_family??null,body.text_color??null,body.background_color??null,body.screenshot_path??null,
        body.snapshot_version??1,JSON.stringify(body.snapshot),body.note??null,body.favorite??false,body.collection_id??null,body.captured_at??new Date().toISOString()];
      const guarded = Object.hasOwn(body, 'base_revision');
      if (guarded && body.base_revision !== null && typeof body.base_revision !== 'string') {
        throw new HttpError(400, 'Invalid library revision.');
      }
      const revision = await asOwner(user.id, async db => {
        const result = guarded && body.base_revision !== null
          ? await db.query(`update public.captures set
              ${columns.slice(2).map((c, i) => `${c}=$${i+3}`).join(',')}
              where id=$1 and user_id=$2 and updated_at=$${values.length+1}::timestamptz
              returning updated_at::text as revision`, [...values, body.base_revision])
          : await db.query(`insert into public.captures(${columns.join(',')})
              values(${values.map((_,i)=>`$${i+1}`).join(',')}) on conflict(id)
              ${guarded ? 'do nothing' : `do update set ${columns.slice(2).map(c=>`${c}=excluded.${c}`).join(',')}`}
              returning updated_at::text as revision`, values);
        if (!result.rows[0]) throw new HttpError(409, 'This reference changed in your cloud library. The cloud version will be kept.');
        return result.rows[0].revision;
      });
      return json({ ok: true, revision });
    }
    if (request.method === 'DELETE') {
      // Owner-derived keys also clean up uploads from an interrupted sync.
      for (const ext of ['png','webp']) await s3.send(new DeleteObjectCommand({ Bucket, Key: screenshotKey(user.id,id,ext) }));
      await asOwner(user.id, db => db.query('delete from public.captures where id=$1', [id]));
      return json({ ok: true });
    }
  }
  const uploadMatch = /^\/screenshots\/([^/]+)\.(png|webp)$/.exec(path);
  if (uploadMatch && request.method === 'GET') {
    const Key = screenshotKey(user.id, uploadMatch[1], uploadMatch[2]);
    const owned = await asOwner(user.id, async db => (await db.query(
      'select id from public.captures where id=$1 and screenshot_path=$2', [uploadMatch[1], Key],
    )).rows[0]);
    if (!owned) throw new HttpError(404, 'Screenshot not found.');
    const object = await s3.send(new GetObjectCommand({ Bucket, Key }));
    return new Response(new Uint8Array(await object.Body!.transformToByteArray()).buffer, {
      headers: { 'Content-Type': `image/${uploadMatch[2]}`, 'Cache-Control': 'no-store' },
    });
  }
  if (uploadMatch && request.method === 'PUT') {
    const Key = screenshotKey(user.id, uploadMatch[1], uploadMatch[2]);
    const contentType = `image/${uploadMatch[2]}`;
    if (request.headers.get('content-type') !== contentType) throw new HttpError(400, 'Invalid image type.');
    const bytes = await limitedBody(request, 5 * 1024 * 1024);
    const valid = uploadMatch[2] === 'png'
      ? Buffer.from(bytes.slice(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
    if (!valid) throw new HttpError(400, 'Invalid image.');
    // A capture's image is immutable. Retried/stale devices must not replace
    // the cloud image before their metadata revision check runs.
    const existing = await asOwner(user.id, async db => (await db.query(
      'select id from public.captures where id=$1 and screenshot_path=$2', [uploadMatch[1], Key],
    )).rows[0]);
    if (existing) return json({ path: Key });
    await s3.send(new PutObjectCommand({ Bucket, Key, Body: bytes, ContentType: contentType, CacheControl: 'private, max-age=3600' }));
    return json({ path: Key });
  }
  throw new HttpError(404, 'Not found.');
}

export default {
  async fetch(request: Request): Promise<Response> {
    try { return await handle(request); }
    catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      const code = (error as { code?: string })?.code;
      if (code === '42501') return json({ error: 'Reference belongs to another account.' }, 403);
      if (['23514','23503','23502','22P02','22007','22001'].includes(code ?? '')) return json({ error: 'Invalid reference data.' },400);
      console.error('Refer API request failed', { code, name: error instanceof Error ? error.name : 'Unknown' });
      return json({ error: 'Unable to complete the request. Please try again.' },500);
    }
  },
};
