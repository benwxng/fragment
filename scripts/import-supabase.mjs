// Run after migrate-neon.mjs. Source backups and credentials must stay gitignored.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const directory = process.env.MIGRATION_BACKUP_DIR ?? 'output/migration';
const data = JSON.parse(await readFile(`${directory}/supabase-export.json`, 'utf8'));
const connectionString = process.env.MIGRATION_DATABASE_URL_FILE
  ? (await readFile(process.env.MIGRATION_DATABASE_URL_FILE, 'utf8')).trim() : process.env.DATABASE_URL_UNPOOLED;
if (!connectionString || new URL(connectionString).hostname.includes('-pooler')) throw new Error('Direct database connection required.');
const db = new pg.Client({ connectionString });
await db.connect();
try {
  await db.query('begin');
  for (const user of data.users ?? []) {
    await db.query(`insert into public.accounts(id,legacy_verified_email) values($1,$2)
      on conflict(id) do nothing`, [user.id,user.verified ? user.email.toLowerCase() : null]);
  }
  for (const table of ['profiles','collections','captures','tags','capture_tags']) {
    for (const row of data[table] ?? []) {
      const keys = Object.keys(row).filter(key => key !== 'search_document');
      if (keys.some(key=>!/^[a-z_]+$/.test(key))) throw new Error('Unexpected column name.');
      const values = keys.map(key => key === 'snapshot' ? JSON.stringify(row[key]) : row[key]);
      await db.query(`insert into public.${table} (${keys.join(',')}) values (${keys.map((_,i)=>`$${i+1}`).join(',')}) on conflict do nothing`, values);
    }
    const { rows } = await db.query(`select count(*)::int as count from public.${table}`);
    console.log(`${table}: ${rows[0].count} rows`);
  }
  await db.query('commit');
} catch(error) { await db.query('rollback'); throw error; }
finally { await db.end(); }

if (process.env.MIGRATION_SKIP_STORAGE !== '1') {
  const keys = JSON.parse(await readFile(`${directory}/supabase-keys.json`, 'utf8'));
  const key = keys.find(k=>k.name === 'service_role')?.api_key ?? keys.find(k=>k.type === 'secret')?.api_key;
  if (!key) throw new Error('Missing source storage credential.');
  const source = process.env.MIGRATION_SUPABASE_URL;
  if (!source) throw new Error('MIGRATION_SUPABASE_URL is required.');
  const s3 = new S3Client({ forcePathStyle: true });
  await mkdir(`${directory}/screenshots`, { recursive:true });
  for (const object of data.objects ?? []) {
    const response = await fetch(`${source}/storage/v1/object/authenticated/${encodeURIComponent(object.bucket_id)}/${object.name.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { apikey:key, Authorization:`Bearer ${key}` },
    });
    if (!response.ok) throw new Error(`Source screenshot download failed (${response.status}): ${await response.text()}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    await writeFile(`${directory}/screenshots/${digest}`, bytes, { mode:0o600 });
    await s3.send(new PutObjectCommand({ Bucket:'uploads',Key:object.name,Body:bytes,
      ContentType:response.headers.get('content-type') ?? object.metadata?.mimetype, CacheControl:'private, max-age=3600' }));
    const saved = await s3.send(new GetObjectCommand({ Bucket:'uploads',Key:object.name }));
    const savedDigest = createHash('sha256').update(await saved.Body.transformToByteArray()).digest('hex');
    if (savedDigest !== digest) throw new Error('Screenshot verification failed.');
    console.log(`Verified screenshot: ${object.name}`);
  }
}
