import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const USER_A = '018f37b2-7f5a-7d8c-9b1e-9ca6155c8bc9';
const USER_B = '018f37b2-a1f0-7d8c-9b1e-9ca6155c8bc9';
const CAPTURE_A = '018f37b2-b25b-7d8c-9b1e-9ca6155c8bc9';
const CAPTURE_B = '018f37b2-c36c-7d8c-9b1e-9ca6155c8bc9';
const COLLECTION_A = '018f37b2-d47d-7d8c-9b1e-9ca6155c8bc9';
const COLLECTION_B = '018f37b2-e58e-7d8c-9b1e-9ca6155c8bc9';
const TAG_A = '018f37b2-f69f-7d8c-9b1e-9ca6155c8bc9';
const TAG_B = '018f37b3-07a0-7d8c-9b1e-9ca6155c8bc9';
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
    await database.exec(`
      set role supabase_auth_admin;
      insert into auth.users (id, raw_user_meta_data)
      values
        ('${USER_A}', '{"display_name":"Designer A"}'),
        ('${USER_B}', '{}');
      reset role;
    `);
  }, 30_000);

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

  it('isolates each user across profiles, collections, captures, tags, and joins', async () => {
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
      update public.profiles set display_name = 'User A' where id = '${USER_A}';
      insert into public.collections (id, user_id, name)
      values ('${COLLECTION_A}', '${USER_A}', 'A collection');
      insert into public.tags (id, user_id, name)
      values ('${TAG_A}', '${USER_A}', 'A tag');
      update public.captures
      set collection_id = '${COLLECTION_A}'
      where id = '${CAPTURE_A}';
      insert into public.capture_tags (capture_id, tag_id, user_id)
      values ('${CAPTURE_A}', '${TAG_A}', '${USER_A}');
    `);

    const userAProfile = await database.query<{ id: string }>(`
      select id::text from public.profiles order by id
    `);
    expect(userAProfile.rows.map(({ id }) => id)).toEqual([USER_A]);

    await becomePostgres();
    await becomeUser(USER_B);
    await database.exec(`
      insert into public.collections (id, user_id, name)
      values ('${COLLECTION_B}', '${USER_B}', 'B collection');
      insert into public.tags (id, user_id, name)
      values ('${TAG_B}', '${USER_B}', 'B tag');
      insert into public.captures (
        id, user_id, facets, source_url, source_origin, page_title,
        collection_id, snapshot
      ) values (
        '${CAPTURE_B}', '${USER_B}', array['component'],
        'https://example.net', 'https://example.net', 'User B capture',
        '${COLLECTION_B}', '{}'
      );
      insert into public.capture_tags (capture_id, tag_id, user_id)
      values ('${CAPTURE_B}', '${TAG_B}', '${USER_B}');
    `);

    const visibleToB = await database.query<{
      captures: string;
      collections: string;
      profiles: string;
      tags: string;
      joins: string;
    }>(`
      select
        (select string_agg(id::text, ',') from public.captures) as captures,
        (select string_agg(id::text, ',') from public.collections) as collections,
        (select string_agg(id::text, ',') from public.profiles) as profiles,
        (select string_agg(id::text, ',') from public.tags) as tags,
        (select string_agg(capture_id::text, ',') from public.capture_tags) as joins
    `);
    expect(visibleToB.rows[0]).toEqual({
      captures: CAPTURE_B,
      collections: COLLECTION_B,
      profiles: USER_B,
      tags: TAG_B,
      joins: CAPTURE_B,
    });

    // Cross-owner writes either affect no rows under RLS or fail ownership checks.
    await database.exec(`
      update public.captures set page_title = 'Tampered' where id = '${CAPTURE_A}';
      delete from public.tags where id = '${TAG_A}';
      update public.profiles set display_name = 'Tampered' where id = '${USER_A}';
    `);
    await expect(database.exec(`
      insert into public.capture_tags (capture_id, tag_id, user_id)
      values ('${CAPTURE_A}', '${TAG_B}', '${USER_B}')
    `)).rejects.toThrow();

    await becomePostgres();
    const untouchedA = await database.query<{
      page_title: string;
      profile_name: string;
      tag_count: string;
    }>(`
      select
        (select page_title from public.captures where id = '${CAPTURE_A}') as page_title,
        (select display_name from public.profiles where id = '${USER_A}') as profile_name,
        (select count(*)::text from public.tags where id = '${TAG_A}') as tag_count
    `);
    expect(untouchedA.rows[0]).toEqual({
      page_title: 'Example',
      profile_name: 'User A',
      tag_count: '1',
    });

    await becomeUser(USER_A);
    const visibleToA = await database.query<{
      captures: string;
      collections: string;
      profiles: string;
      tags: string;
      joins: string;
    }>(`
      select
        (select string_agg(id::text, ',') from public.captures) as captures,
        (select string_agg(id::text, ',') from public.collections) as collections,
        (select string_agg(id::text, ',') from public.profiles) as profiles,
        (select string_agg(id::text, ',') from public.tags) as tags,
        (select string_agg(capture_id::text, ',') from public.capture_tags) as joins
    `);
    expect(visibleToA.rows[0]).toEqual({
      captures: CAPTURE_A,
      collections: COLLECTION_A,
      profiles: USER_A,
      tags: TAG_A,
      joins: CAPTURE_A,
    });
    await becomePostgres();
  });

  it('allows Storage upsert/delete for an owner and hides objects from strangers', async () => {
    const pathA = `${USER_A}/${CAPTURE_A}.webp`;
    const pathB = `${USER_B}/${CAPTURE_B}.png`;
    await becomeUser(USER_A);
    await database.exec(`
      insert into storage.objects (bucket_id, name)
      values ('reference-shots', '${pathA}')
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
    await database.exec(`
      insert into storage.objects (bucket_id, name)
      values ('reference-shots', '${pathB}')
      on conflict (bucket_id, name) do update set name = excluded.name;
    `);
    const visibleToB = await database.query<{ name: string }>(`
      select name from storage.objects where bucket_id = 'reference-shots'
    `);
    expect(visibleToB.rows.map(({ name }) => name)).toEqual([pathB]);
    await database.exec(`
      update storage.objects set name = '${USER_B}/${CAPTURE_A}.webp'
      where bucket_id = 'reference-shots' and name = '${pathA}';
      delete from storage.objects
      where bucket_id = 'reference-shots' and name = '${pathA}';
    `);

    await becomePostgres();
    await becomeUser(USER_A);
    const visibleToA = await database.query<{ name: string }>(`
      select name from storage.objects where bucket_id = 'reference-shots'
    `);
    expect(visibleToA.rows.map(({ name }) => name)).toEqual([pathA]);
    await database.exec(`
      delete from storage.objects
      where bucket_id = 'reference-shots' and name = '${pathA}'
    `);
    const deleted = await database.query<{ count: string }>(`
      select count(*)::text as count from storage.objects
      where bucket_id = 'reference-shots'
    `);
    expect(deleted.rows[0]?.count).toBe('0');
    await becomePostgres();

    const remaining = await database.query<{ name: string }>(`
      select name from storage.objects where bucket_id = 'reference-shots'
    `);
    expect(remaining.rows.map(({ name }) => name)).toEqual([pathB]);
  });
});
