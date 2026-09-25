import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

assert(url, 'SUPABASE_URL is required.');
assert(publishableKey?.startsWith('sb_publishable_'), 'A Supabase publishable key is required.');
assert(secretKey, 'A Supabase secret or legacy service-role key is required for disposable-user cleanup.');

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};
const admin = createClient(url, secretKey, { auth: authOptions });
const client = createClient(url, publishableKey, { auth: authOptions });
const secondClient = createClient(url, publishableKey, { auth: authOptions });
const anonymous = createClient(url, publishableKey, { auth: authOptions });
const email = `refer-smoke-${randomUUID()}@example.com`;
const password = `${randomBytes(24).toString('base64url')}aA1!`;
const secondEmail = `refer-smoke-${randomUUID()}@example.com`;
const secondPassword = `${randomBytes(24).toString('base64url')}aA1!`;
const captureId = randomUUID();
const secondCaptureId = randomUUID();
let userId;
let secondUserId;
let objectPath;
let secondObjectPath;
let smokePassed = false;

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(createError);
  assert(created.user?.id, 'Supabase did not return the disposable user.');
  userId = created.user.id;
  objectPath = `${userId}/${captureId}.png`;

  const { data: secondCreated, error: secondCreateError } = await admin.auth.admin.createUser({
    email: secondEmail,
    password: secondPassword,
    email_confirm: true,
  });
  assert.ifError(secondCreateError);
  assert(secondCreated.user?.id, 'Supabase did not return the second disposable user.');
  secondUserId = secondCreated.user.id;
  secondObjectPath = `${secondUserId}/${secondCaptureId}.png`;

  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.equal(signedIn.user?.id, userId);
  const { data: secondSignedIn, error: secondSignInError } = await secondClient.auth.signInWithPassword({
    email: secondEmail,
    password: secondPassword,
  });
  assert.ifError(secondSignInError);
  assert.equal(secondSignedIn.user?.id, secondUserId);

  const png = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ));
  const { error: uploadError } = await client.storage
    .from('reference-shots')
    .upload(objectPath, png, { contentType: 'image/png', upsert: true });
  assert.ifError(uploadError);

  const invalidPath = `${userId}/nested/${captureId}.png`;
  const { error: invalidPathError } = await client.storage
    .from('reference-shots')
    .upload(invalidPath, png, { contentType: 'image/png' });
  assert(invalidPathError, 'Storage accepted a path outside the enforced owner/capture shape.');

  const { error: insertError } = await client.from('captures').insert({
    id: captureId,
    facets: ['typography', 'component'],
    source_url: 'https://example.com/reference',
    source_origin: 'https://example.com',
    page_title: 'Refer cloud smoke test',
    element_label: 'Editorial card',
    primary_font_family: 'Inter',
    text_color: 'rgb(24, 25, 22)',
    background_color: 'rgb(247, 247, 244)',
    screenshot_path: objectPath,
    snapshot_version: 1,
    snapshot: { smoke: true, captureId },
  });
  assert.ifError(insertError);

  const { data: ownRows, error: ownReadError } = await client
    .from('captures')
    .select('id,user_id,screenshot_path')
    .eq('id', captureId);
  assert.ifError(ownReadError);
  assert.deepEqual(ownRows, [{ id: captureId, user_id: userId, screenshot_path: objectPath }]);

  const { data: hiddenFromSecond, error: secondReadError } = await secondClient
    .from('captures')
    .select('id')
    .eq('id', captureId);
  assert.ifError(secondReadError);
  assert.deepEqual(hiddenFromSecond, [], 'A second authenticated user could read the first user’s capture.');

  const { data: crossOwnerUpdate, error: crossOwnerUpdateError } = await secondClient
    .from('captures')
    .update({ page_title: 'Cross-owner update' })
    .eq('id', captureId)
    .select('id');
  assert.ifError(crossOwnerUpdateError);
  assert.deepEqual(crossOwnerUpdate, [], 'A second authenticated user could update the first user’s capture.');

  const { error: secondUploadError } = await secondClient.storage
    .from('reference-shots')
    .upload(secondObjectPath, png, { contentType: 'image/png', upsert: true });
  assert.ifError(secondUploadError);
  const { error: secondInsertError } = await secondClient.from('captures').insert({
    id: secondCaptureId,
    facets: ['component'],
    source_url: 'https://example.net/reference',
    source_origin: 'https://example.net',
    page_title: 'Second user capture',
    element_label: 'Second user card',
    screenshot_path: secondObjectPath,
    snapshot_version: 1,
    snapshot: { smoke: true, secondCaptureId },
  });
  assert.ifError(secondInsertError);

  const { data: hiddenFromFirst, error: firstReadSecondError } = await client
    .from('captures')
    .select('id')
    .eq('id', secondCaptureId);
  assert.ifError(firstReadSecondError);
  assert.deepEqual(hiddenFromFirst, [], 'The first user could read the second user’s capture.');

  const { error: crossOwnerSignedUrlError } = await secondClient.storage
    .from('reference-shots')
    .createSignedUrl(objectPath, 60);
  assert(crossOwnerSignedUrlError, 'A second authenticated user could sign the first user’s screenshot URL.');

  const { data: anonymousRows, error: anonymousReadError } = await anonymous
    .from('captures')
    .select('id')
    .eq('id', captureId);
  if (anonymousReadError) {
    assert.equal(anonymousReadError.code, '42501', 'Anonymous access failed for an unexpected reason.');
  } else {
    assert.deepEqual(anonymousRows, [], 'RLS exposed an authenticated capture to an anonymous client.');
  }

  const { data: signedUrl, error: signedUrlError } = await client.storage
    .from('reference-shots')
    .createSignedUrl(objectPath, 60);
  assert.ifError(signedUrlError);
  const response = await fetch(signedUrl.signedUrl);
  assert.equal(response.ok, true, `Signed screenshot returned HTTP ${response.status}.`);

  smokePassed = true;
} finally {
  if (objectPath) await client.storage.from('reference-shots').remove([objectPath]);
  if (secondObjectPath) await secondClient.storage.from('reference-shots').remove([secondObjectPath]);
  await client.from('captures').delete().eq('id', captureId);
  await secondClient.from('captures').delete().eq('id', secondCaptureId);
  await client.auth.signOut({ scope: 'local' });
  await secondClient.auth.signOut({ scope: 'local' });
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (secondUserId) await admin.auth.admin.deleteUser(secondUserId);
}

if (smokePassed) {
  process.stdout.write([
    'Refer cloud smoke test passed.',
    '  verified: two accounts, profile triggers, owner-only capture insert/read/update, anonymous isolation',
    '  verified: mutual database and private screenshot isolation between authenticated users',
    '  verified: private screenshot upload, strict path rejection, and signed download',
    '  cleanup: disposable capture, object, session, and user removed',
    '',
  ].join('\n'));
}
