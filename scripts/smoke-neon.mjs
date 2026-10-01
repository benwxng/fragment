import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import {createRemoteJWKSet,jwtVerify} from 'jose';
const db = new pg.Client({ connectionString:process.env.DATABASE_URL_UNPOOLED });
await db.connect();
const base = process.env.NEON_FUNCTION_API_BASE_URL;
const auth = process.env.NEON_AUTH_BASE_URL;
assert(base && auth, 'Load the Neon branch environment first.');
const users=[];
const captures=[];
const passwords=[];
const digest = value => createHash('sha256').update(value).digest('hex');
async function call(path,token,method='GET',body) {
  const response = await fetch(new URL(path,base),{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
async function createUser() {
  const email=`refer-migration-${randomUUID()}@example.com`;
  const password=`${randomBytes(24).toString('base64url')}aA1!`;
  const headers={'Content-Type':'application/json',origin:'http://localhost:3000'};
  const signup=await fetch(`${auth}/sign-up/email`,{method:'POST',headers,body:JSON.stringify({email,password,name:'Migration test'})});
  const created=await signup.json();
  assert.equal(signup.status,200,JSON.stringify(created));
  users.push(created.user.id); passwords.push({email,password});
  await db.query('update neon_auth."user" set "emailVerified"=true where id=$1',[created.user.id]);
  const signin=await fetch(`${auth}/sign-in/email`,{method:'POST',headers,body:JSON.stringify({email,password})});
  assert.equal(signin.status,200);
  const cookie=signin.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const tokenResponse=await fetch(`${auth}/token`,{headers:{cookie,origin:'http://localhost:3000'}});
  const token=await tokenResponse.json();
  assert.equal(tokenResponse.status,200,JSON.stringify(token));
  assert(token.token);
  if (process.env.DEBUG_AUTH === '1') { const parts=token.token.split('.'); const payload=JSON.parse(Buffer.from(parts[1],'base64url')); console.log({jwtHeader:JSON.parse(Buffer.from(parts[0],'base64url')),issuer:payload.iss,audience:payload.aud,expectedIssuer:auth}); }
  await jwtVerify(token.token,createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL)),{issuer:new URL(auth).origin,audience:new URL(auth).origin,algorithms:['EdDSA']});
  const me=await call('/me',token.token);
  assert.equal(me.status,200,JSON.stringify(me));
  return {token:token.token,user:me.body.user,cookie};
}
let success=false;
try {
  assert.equal((await call('/captures')).status,401);
  assert.equal((await call('/captures','invalid')).status,401);
  const a=await createUser(); const b=await createUser();
  console.log('PASS real Neon signup, signin, JWT verification and account resolution');
  // Verify imported legacy identity links only after Neon verifies the email.
  const legacyId=randomUUID();
  await db.query('delete from public.profiles where id=$1',[b.user.id]);
  await db.query('delete from public.accounts where id=$1',[b.user.id]);
  await db.query('insert into public.accounts(id,legacy_verified_email) values($1,$2)',[legacyId,b.user.email]);
  await db.query('update neon_auth."user" set "emailVerified"=false where id=$1',[users[1]]);
  assert.equal((await call('/me',b.token)).status,403);
  assert.equal((await db.query('select auth_user_id from public.accounts where id=$1',[legacyId])).rows[0].auth_user_id,null);
  await db.query('update neon_auth."user" set "emailVerified"=true where id=$1',[users[1]]);
  b.user=(await call('/me',b.token)).body.user;
  assert.equal(b.user.id,legacyId);
  console.log('PASS verified-email legacy ID mapping; unverified account cannot claim data');
  const id=randomUUID(); captures.push({id,token:a.token});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  const upload=await fetch(new URL(`/screenshots/${id}.png`,base),{method:'PUT',headers:{Authorization:`Bearer ${a.token}`,'Content-Type':'image/png'},body:png});
  assert.equal(upload.status,200,await upload.text());
  const row={id,user_id:a.user.id,facets:['typography'],source_url:'https://example.com',source_origin:'https://example.com',snapshot:{id,snapshotVersion:1,capturedAt:new Date().toISOString(),facets:['typography'],source:{url:'https://example.com',origin:'https://example.com',title:'Sync fixture'},element:{semantic:{tagName:'p',accessibleName:'Shared reference'},textExcerpt:'Offline reference',typography:{primaryFontFamily:'Inter',fontFamily:'Inter'},colors:{text:'rgb(0, 0, 0)',effectiveBackground:'rgb(255, 255, 255)'}},screenshot:{dataUrl:null,storagePath:null,mimeType:'image/png',width:1,height:1},note:null,tags:[],favorite:false,collectionId:null},screenshot_path:`${a.user.id}/${id}.png`};
  assert.equal((await call(`/captures/${id}`,a.token,'PUT',row)).status,200);
  let result=await call(`/captures/${id}`,a.token);
  assert.equal(result.status,200);
  const screenshot=await fetch(result.body.capture.screenshot_url);
  assert.equal(screenshot.status,200);
  assert.deepEqual(Buffer.from(await screenshot.arrayBuffer()),png);
  const unsigned=new URL(result.body.capture.screenshot_url);unsigned.search='';
  assert.notEqual((await fetch(unsigned)).status,200);
  assert.equal((await call(`/captures/${id}`,b.token)).status,404);
  assert.equal((await call('/captures',b.token)).body.captures.length,0);
  assert.equal((await call(`/captures/${id}`,b.token,'PUT',{...row,user_id:b.user.id,screenshot_path:null})).status,403);
  assert.equal((await call(`/captures/${id}`,b.token,'PUT',row)).status,403);
  assert.equal((await call(`/captures/${id}`,b.token,'DELETE')).status,200);
  assert.equal((await call(`/captures/${id}`,a.token)).status,200);
  console.log('PASS capture save/read/update isolation and private screenshot upload/download');
  const sync = await call('/library-sync', a.token);
  assert.equal(sync.status, 200);
  assert.equal(sync.body.complete, true);
  assert.equal(sync.body.userId, a.user.id);
  const revision = sync.body.captures.find(capture => capture.id === id).sync_revision;
  assert(revision);
  assert.deepEqual((await call('/library-sync', b.token)).body.captures, []);
  assert.equal((await call('/library-sync')).status, 401);
  const offlineImage = await fetch(new URL(`/screenshots/${id}.png`, base), { headers: { Authorization: `Bearer ${a.token}` } });
  assert.equal(offlineImage.status, 200);
  assert.deepEqual(Buffer.from(await offlineImage.arrayBuffer()), png);
  assert.equal((await fetch(new URL(`/screenshots/${id}.png`, base), { headers: { Authorization: `Bearer ${b.token}` } })).status, 404);
  const edited = await call(`/captures/${id}`, a.token, 'PUT', { ...row, note: 'new cloud note', base_revision: revision });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.notEqual(edited.body.revision, revision);
  assert.equal((await call(`/captures/${id}`, a.token, 'PUT', { ...row, note: 'stale', base_revision: revision })).status, 409);
  assert.equal((await call(`/captures/${id}`, a.token, 'PUT', { ...row, base_revision: null })).status, 409);
  assert.equal((await call(`/captures/${id}`, a.token)).body.capture.note, 'new cloud note');
  // A complete snapshot must include references beyond the former 500-row cutoff.
  await db.query(`insert into public.captures(id,user_id,facets,source_url,source_origin,snapshot)
    select gen_random_uuid(),$1,ARRAY['typography'],'https://example.com','https://example.com','{}'::jsonb
    from generate_series(1,501)`, [a.user.id]);
  assert.equal((await call('/library-sync', a.token)).body.captures.length, 502);
  assert.equal((await call('/captures', a.token)).body.captures.length, 502);
  await db.query('delete from public.captures where user_id=$1 and id<>$2', [a.user.id, id]);
  console.log('PASS complete library snapshot, offline image download, account isolation, and stale-write rejection');
  if (process.env.VERIFY_EXTENSION_SYNC === '1') {
    const { verifyLibrarySync } = await import('./verify-library-sync.mjs');
    await verifyLibrarySync({ base, token: a.token, row, png });
  }

  const verifier=randomBytes(32).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const redirectUri='https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/';
  assert.equal((await call('/extension/authorize',a.token,'POST',{challenge,redirectUri:'https://evil.example/'})).status,400);
  const authorize=await call('/extension/authorize',a.token,'POST',{challenge,redirectUri});
  assert.equal(authorize.status,200);
  const {code}=authorize.body;
  assert.equal((await call('/extension/exchange',null,'POST',{code,verifier:randomBytes(32).toString('base64url'),redirectUri})).status,401);
  const exchange=await call('/extension/exchange',null,'POST',{code,verifier,redirectUri});
  assert.equal(exchange.status,200);
  assert.equal((await call('/extension/exchange',null,'POST',{code,verifier,redirectUri})).status,401);
  assert.equal((await call('/me',exchange.body.token)).body.user.id,a.user.id);
  assert.equal((await call('/extension/authorize',exchange.body.token,'POST',{challenge,redirectUri})).status,403);
  assert.equal((await call('/extension/session',exchange.body.token,'DELETE')).status,200);
  assert.equal((await call('/me',exchange.body.token)).status,401);
  console.log('PASS extension PKCE, code single-use, callback validation and session revocation');
  // Database policies protect reads even if the server forgets an owner predicate.
  await db.query('begin'); await db.query('set local role refer_app');
  await db.query("select set_config('refer.user_id',$1,true)",[b.user.id]);
  assert.equal((await db.query('select * from public.captures where id=$1',[id])).rowCount,0);
  await db.query('rollback');
  await call(`/captures/${id}`,a.token,'DELETE');
  assert.equal((await call(`/captures/${id}`,a.token)).status,404);
  assert.deepEqual((await call('/library-sync', a.token)).body.captures, []);
  assert.equal((await call(`/captures/${id}`, a.token, 'PUT', { ...row, base_revision: edited.body.revision })).status, 409);
  assert.equal((await call(`/captures/${id}`, a.token)).status, 404);

  assert.notEqual((await fetch(result.body.capture.screenshot_url)).status,200);
  console.log('PASS database RLS and capture/screenshot deletion');
  const signout=await fetch(`${auth}/sign-out`,{method:'POST',headers:{cookie:a.cookie,origin:'http://localhost:3000','Content-Type':'application/json'},body:'{}'});
  assert.equal(signout.status,200);
  assert.equal(await (await fetch(`${auth}/get-session`,{headers:{cookie:a.cookie}})).json(),null);
  console.log('PASS Neon session signout');
  success=true;
} finally {
  await db.query('rollback');
  for (const capture of captures) await call(`/captures/${capture.id}`,capture.token,'DELETE').catch(()=>{});
  if (process.env.KEEP_SMOKE_USERS === '1' && success) {
    await writeFile('output/migration/smoke-users.json',JSON.stringify(passwords),{mode:0o600});
    console.log('Retained disposable users for browser verification.');
  } else {
    for (const id of users) {
      await db.query('delete from public.accounts where auth_user_id=$1',[id]);
      await db.query('delete from neon_auth."user" where id=$1',[id]);
    }
  }
  await db.end();
}
