-- Refer's client-facing schema is deliberately small. The browser extension and
-- web library use Supabase Auth JWTs directly; authorization lives in RLS.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 120)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_id_user_id_unique unique (id, user_id),
  constraint collections_name_length check (char_length(btrim(name)) between 1 and 80)
);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  facets text[] not null,
  source_url text not null,
  source_origin text not null,
  page_title text not null default '',
  element_label text not null default '',
  primary_font_family text,
  text_color text,
  background_color text,
  screenshot_path text,
  snapshot_version smallint not null default 1,
  snapshot jsonb not null,
  note text,
  favorite boolean not null default false,
  collection_id uuid,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(page_title, '') || ' ' ||
      coalesce(source_origin, '') || ' ' ||
      coalesce(element_label, '') || ' ' ||
      coalesce(primary_font_family, '') || ' ' ||
      coalesce(note, '') || ' ' ||
      coalesce(snapshot #>> '{element,textExcerpt}', '')
    )
  ) stored,
  constraint captures_id_user_id_unique unique (id, user_id),
  constraint captures_collection_owner_fkey
    foreign key (collection_id, user_id)
    references public.collections (id, user_id)
    on delete set null (collection_id),
  constraint captures_facets_nonempty check (cardinality(facets) > 0),
  constraint captures_facets_allowed check (
    facets <@ array['typography', 'component', 'color', 'layout']::text[]
  ),
  constraint captures_source_url_length check (char_length(source_url) between 1 and 4096),
  constraint captures_source_origin_length check (char_length(source_origin) between 1 and 2048),
  constraint captures_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint captures_snapshot_version_positive check (snapshot_version > 0),
  constraint captures_note_length check (note is null or char_length(note) <= 10000),
  constraint captures_screenshot_path_matches_owner check (
    screenshot_path is null
    or screenshot_path = user_id::text || '/' || id::text || '.webp'
    or screenshot_path = user_id::text || '/' || id::text || '.png'
  )
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_id_user_id_unique unique (id, user_id),
  constraint tags_name_length check (char_length(btrim(name)) between 1 and 60)
);

create table public.capture_tags (
  capture_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (capture_id, tag_id),
  constraint capture_tags_capture_owner_fkey
    foreign key (capture_id, user_id)
    references public.captures (id, user_id)
    on delete cascade,
  constraint capture_tags_tag_owner_fkey
    foreign key (tag_id, user_id)
    references public.tags (id, user_id)
    on delete cascade
);

-- RLS owner lookups and the primary library/filter query paths.
create index captures_user_captured_at_idx
  on public.captures (user_id, captured_at desc);
create index captures_user_collection_captured_at_idx
  on public.captures (user_id, collection_id, captured_at desc);
create index captures_user_font_family_idx
  on public.captures (user_id, primary_font_family);
create index captures_facets_idx
  on public.captures using gin (facets);
create index captures_search_document_idx
  on public.captures using gin (search_document);

create unique index collections_user_normalized_name_idx
  on public.collections (user_id, lower(btrim(name)));
create unique index tags_user_normalized_name_idx
  on public.tags (user_id, lower(btrim(name)));
create index capture_tags_user_tag_idx
  on public.capture_tags (user_id, tag_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated, service_role;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger collections_set_updated_at
before update on public.collections
for each row execute function private.set_updated_at();

create trigger captures_set_updated_at
before update on public.captures
for each row execute function private.set_updated_at();

create trigger tags_set_updated_at
before update on public.tags
for each row execute function private.set_updated_at();

-- Auth owns profile lifecycle. This definer function is private, has a fixed
-- search path, and is not directly executable by API roles.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Backfill profiles when this migration is applied to a project that already
-- contains the owner's Auth account.
insert into public.profiles (id, display_name)
select
  id,
  nullif(btrim(raw_user_meta_data ->> 'display_name'), '')
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.captures enable row level security;
alter table public.tags enable row level security;
alter table public.capture_tags enable row level security;

-- New Supabase projects no longer auto-expose public tables. Grants and RLS
-- intentionally ship together; anon receives no access to private user data.
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.collections from public, anon, authenticated;
revoke all on table public.captures from public, anon, authenticated;
revoke all on table public.tags from public, anon, authenticated;
revoke all on table public.capture_tags from public, anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.collections to authenticated;
grant select, insert, update, delete on table public.captures to authenticated;
grant select, insert, update, delete on table public.tags to authenticated;
grant select, insert, delete on table public.capture_tags to authenticated;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy collections_select_own
on public.collections for select
to authenticated
using ((select auth.uid()) = user_id);

create policy collections_insert_own
on public.collections for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy collections_update_own
on public.collections for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy collections_delete_own
on public.collections for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy captures_select_own
on public.captures for select
to authenticated
using ((select auth.uid()) = user_id);

create policy captures_insert_own
on public.captures for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy captures_update_own
on public.captures for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy captures_delete_own
on public.captures for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy tags_select_own
on public.tags for select
to authenticated
using ((select auth.uid()) = user_id);

create policy tags_insert_own
on public.tags for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy tags_update_own
on public.tags for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy tags_delete_own
on public.tags for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy capture_tags_select_own
on public.capture_tags for select
to authenticated
using ((select auth.uid()) = user_id);

create policy capture_tags_insert_own
on public.capture_tags for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy capture_tags_delete_own
on public.capture_tags for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Screenshots are private and constrained to 5 MiB PNG/WebP objects.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'reference-shots',
  'reference-shots',
  false,
  5242880,
  array['image/webp', 'image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy reference_shots_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'reference-shots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* (
    '^' || (select auth.uid())::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](webp|png)$'
  )
);

create policy reference_shots_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'reference-shots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* (
    '^' || (select auth.uid())::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](webp|png)$'
  )
);

create policy reference_shots_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'reference-shots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* (
    '^' || (select auth.uid())::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](webp|png)$'
  )
)
with check (
  bucket_id = 'reference-shots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* (
    '^' || (select auth.uid())::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](webp|png)$'
  )
);

create policy reference_shots_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'reference-shots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~* (
    '^' || (select auth.uid())::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](webp|png)$'
  )
);
