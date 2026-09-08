begin;

select plan(24);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'collections', 'collections table exists');
select has_table('public', 'captures', 'captures table exists');
select has_table('public', 'tags', 'tags table exists');
select has_table('public', 'capture_tags', 'capture_tags table exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'profiles has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.collections'::regclass),
  true,
  'collections has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.captures'::regclass),
  true,
  'captures has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.tags'::regclass),
  true,
  'tags has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.capture_tags'::regclass),
  true,
  'capture_tags has RLS enabled'
);

select is(
  (select public from storage.buckets where id = 'reference-shots'),
  false,
  'reference-shots bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'reference-shots'),
  5242880::bigint,
  'reference-shots bucket limits files to 5 MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'reference-shots'),
  array['image/webp', 'image/png']::text[],
  'reference-shots bucket only accepts WebP and PNG'
);

select ok(
  not has_table_privilege('anon', 'public.captures', 'select'),
  'anon cannot select captures'
);
select ok(
  has_table_privilege('authenticated', 'public.captures', 'select'),
  'authenticated can select captures before RLS filtering'
);
select ok(
  has_table_privilege('authenticated', 'public.captures', 'insert'),
  'authenticated can insert captures before RLS filtering'
);
select ok(
  has_table_privilege('authenticated', 'public.captures', 'update'),
  'authenticated can update captures before RLS filtering'
);
select ok(
  has_table_privilege('authenticated', 'public.captures', 'delete'),
  'authenticated can delete captures before RLS filtering'
);

select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  2::bigint,
  'profiles has explicit select and update policies'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'collections'),
  4::bigint,
  'collections has one policy per CRUD operation'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'captures'),
  4::bigint,
  'captures has one policy per CRUD operation'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tags'),
  4::bigint,
  'tags has one policy per CRUD operation'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'capture_tags'),
  3::bigint,
  'capture_tags has explicit select, insert, and delete policies'
);
select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'reference_shots_%_own'
  ),
  4::bigint,
  'reference-shots has one owner policy per Storage operation'
);
select ok(
  not has_table_privilege('authenticated', 'public.capture_tags', 'update'),
  'capture_tags rows cannot be reassigned with update'
);

select * from finish();
rollback;
