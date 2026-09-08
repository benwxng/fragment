import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const USER_A = '018f37b2-7f5a-7d8c-9b1e-9ca6155c8bc9';
const USER_B = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc9';
const CAPTURE_A = '018f37b2-b25b-7d8c-9b1e-9ca6155c8bc9';
const MIGRATION_URL = new URL(
  '../../../supabase/migrations/20260907213645_initial_refer_schema.sql',
  import.meta.url,
);

let database: PGlite;

async function becomeUser(userId: string): Promise<void> {
  await database.exec(`
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${userId}', false);
  `);
}

async function becomePostgres(): Promise<void> {
  await database.exec(`
    reset role;
    reset request.jwt.claim.sub;
  `);
}

describe('initial Refer migration', () => {
  beforeAll(async () => {
    database = new PGlite();

    // These are deliberately minimal stand-ins for the schemas, roles, and
    // helpers that the hosted Supabase platform installs before app migrations.
    await database.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role supabase_auth_admin nologin;

      create schema auth;
      create table auth.users (
        id uuid primary key,
        raw_user_meta_data jsonb
      );
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to supabase_auth_admin;
      grant insert on auth.users to supabase_auth_admin;

      create schema storage;
      create table storage.buckets (
        id text primary key,
        name text not null,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
      create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text not null references storage.buckets (id),
        name text not null,
        unique (bucket_id, name)
      );
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select, insert, update, delete on storage.objects to authenticated;

      create function storage.foldername(name text)
      returns text[]
      language sql
      immutable
      as $$
        select case
          when position('/' in name) = 0 then array[]::text[]
          else string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
        end
      $$;
    `);

    await database.exec(await readFile(MIGRATION_URL, 'utf8'));
  });

  afterAll(async () => {
    await database.close();
  });

  it('applies all tables, grants, RLS, policies, and the private bucket', async () => {
    const tables = await database.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `);
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      'capture_tags',
      'captures',
      'collections',
      'profiles',
      'tags',
    ]);

    const unsecured = await database.query<{ count: string }>(`
      select count(*)::text as count
      from pg_class
      where oid in (
        'public.profiles'::regclass,
        'public.collections'::regclass,
        'public.captures'::regclass,
        'public.tags'::regclass,
        'public.capture_tags'::regclass
      )
      and not relrowsecurity
    `);
    expect(unsecured.rows[0]?.count).toBe('0');

    const policies = await database.query<{ count: string }>(`
      select count(*)::text as count
      from pg_policies
      where (schemaname = 'public' and tablename in (
        'profiles', 'collections', 'captures', 'tags', 'capture_tags'
      )) or (schemaname = 'storage' and tablename = 'objects' and policyname like 'reference_shots_%')
    `);
    expect(policies.rows[0]?.count).toBe('21');

    const bucket = await database.query<{
      public: boolean;
      file_size_limit: number;
      allowed_mime_types: string[];
    }>(`
      select public, file_size_limit, allowed_mime_types
      from storage.buckets
      where id = 'reference-shots'
    `);
    expect(bucket.rows[0]).toEqual({
      public: false,
      file_size_limit: 5_242_880,
      allowed_mime_types: ['image/webp', 'image/png'],
    });
  });

  it('creates profiles and keeps updated_at server-owned', async () => {
    await database.exec('set role supabase_auth_admin;');
    await database.exec(`
      insert into auth.users (id, raw_user_meta_data)
      values
        ('${USER_A}', '{"display_name":"Designer A"}'),
        ('${USER_B}', '{}');
    `);
    await becomePostgres();

    const created = await database.query<{ display_name: string | null }>(`
      select display_name from public.profiles where id = '${USER_A}'
    `);
    expect(created.rows[0]?.display_name).toBe('Designer A');

    const before = await database.query<{ updated_at: string }>(`
      select updated_at::text from public.profiles where id = '${USER_A}'
    `);
    await becomeUser(USER_A);
    await database.exec(`
      update public.profiles
      set display_name = 'Updated', updated_at = '2000-01-01T00:00:00Z'
      where id = '${USER_A}'
    `);
    await becomePostgres();
    const after = await database.query<{ updated_at: string }>(`
      select updated_at::text from public.profiles where id = '${USER_A}'
    `);
    expect(after.rows[0]?.updated_at).not.toBe('2000-01-01 00:00:00+00');
    expect(Date.parse(after.rows[0]?.updated_at ?? '')).toBeGreaterThanOrEqual(
      Date.parse(before.rows[0]?.updated_at ?? ''),
    );
  });

  it('allows an owner upsert while isolating capture rows from another user', async () => {
    await becomeUser(USER_A);
    await database.exec(`
      insert into public.captures (
        id, user_id, facets, source_url, source_origin, page_title, snapshot
      ) values (
        '${CAPTURE_A}', '${USER_A}', array['typography'],
        'https://example.com', 'https://example.com', 'Example',
        '{"element":{"textExcerpt":"Hello"}}'
      )
      on conflict (id) do update set page_title = excluded.page_title;
    `);

    const ownerRows = await database.query<{ count: string }>(`
      select count(*)::text as count from public.captures
    `);
    expect(ownerRows.rows[0]?.count).toBe('1');

    await becomePostgres();
    await becomeUser(USER_B);
    const strangerRows = await database.query<{ count: string }>(`
      select count(*)::text as count from public.captures
    `);
    expect(strangerRows.rows[0]?.count).toBe('0');

    await expect(database.exec(`
      insert into public.captures (
        id, user_id, facets, source_url, source_origin, snapshot
      ) values (
        gen_random_uuid(), '${USER_A}', array['component'],
        'https://example.net', 'https://example.net', '{}'
      )
    `)).rejects.toThrow();
    await becomePostgres();
  });

  it('allows Storage upsert/delete for an owner and hides objects from strangers', async () => {
    const path = `${USER_A}/${CAPTURE_A}.webp`;
    await becomeUser(USER_A);
    await database.exec(`
      insert into storage.objects (bucket_id, name)
      values ('reference-shots', '${path}')
      on conflict (bucket_id, name) do update set name = excluded.name;
    `);

    const ownerRows = await database.query<{ count: string }>(`
      select count(*)::text as count from storage.objects
      where bucket_id = 'reference-shots'
    `);
    expect(ownerRows.rows[0]?.count).toBe('1');

    await expect(database.exec(`
      insert into storage.objects (bucket_id, name)
      values ('reference-shots', '${USER_A}/nested/${CAPTURE_A}.webp')
    `)).rejects.toThrow();
    await expect(database.exec(`
      insert into storage.objects (bucket_id, name)
      values ('reference-shots', '${USER_A}/not-a-capture.webp')
    `)).rejects.toThrow();

    await becomePostgres();
    await becomeUser(USER_B);
    const strangerRows = await database.query<{ count: string }>(`
      select count(*)::text as count from storage.objects
      where bucket_id = 'reference-shots'
    `);
    expect(strangerRows.rows[0]?.count).toBe('0');

    await becomePostgres();
    await becomeUser(USER_A);
    await database.exec(`
      delete from storage.objects
      where bucket_id = 'reference-shots' and name = '${path}'
    `);
    const deleted = await database.query<{ count: string }>(`
      select count(*)::text as count from storage.objects
      where bucket_id = 'reference-shots'
    `);
    expect(deleted.rows[0]?.count).toBe('0');
    await becomePostgres();
  });
});
