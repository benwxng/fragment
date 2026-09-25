import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

const connectionString = process.env.MIGRATION_DATABASE_URL_FILE
  ? (await readFile(process.env.MIGRATION_DATABASE_URL_FILE, 'utf8')).trim()
  : process.env.DATABASE_URL_UNPOOLED;
if (!connectionString || new URL(connectionString).hostname.includes('-pooler')) {
  throw new Error('Use a direct DATABASE_URL_UNPOOLED or MIGRATION_DATABASE_URL_FILE.');
}
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query('select pg_advisory_lock(741258963)');
  await client.query(`create schema if not exists private;
    revoke all on schema private from public;
    create table if not exists private.schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz default now()
    )`);
  for (const name of (await readdir(new URL('../neon/migrations/', import.meta.url))).filter(n => n.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(`../neon/migrations/${name}`, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const { rows } = await client.query('select checksum from private.schema_migrations where name=$1', [name]);
    if (rows.length) {
      if (rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      console.log(`Already applied: ${name}`);
      continue;
    }
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into private.schema_migrations(name,checksum) values($1,$2)', [name, checksum]);
      await client.query('commit');
      console.log(`Applied: ${name}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
} finally {
  await client.end();
}
