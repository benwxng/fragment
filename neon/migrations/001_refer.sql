-- Application identities remain stable across authentication providers.
create schema if not exists private;
revoke all on schema private from public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'refer_app') then
    create role refer_app nologin nobypassrls;
  end if;
  execute format('grant refer_app to %I', current_user);
end $$;
create function private.current_user_id() returns uuid language sql stable
set search_path = '' as $$ select nullif(current_setting('refer.user_id', true), '')::uuid $$;
revoke all on function private.current_user_id() from public;
grant usage on schema public, private to refer_app;
grant execute on function private.current_user_id() to refer_app;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references neon_auth."user"(id),
  legacy_verified_email text unique,
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
revoke all on public.accounts from public;

create table public.profiles (
  id uuid primary key references public.accounts (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 120)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default private.current_user_id() references public.accounts (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_id_user_id_unique unique (id, user_id),
  constraint collections_name_length check (char_length(btrim(name)) between 1 and 80)
);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default private.current_user_id() references public.accounts (id) on delete cascade,
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
  user_id uuid not null default private.current_user_id() references public.accounts (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_id_user_id_unique unique (id, user_id),
  constraint tags_name_length check (char_length(btrim(name)) between 1 and 60)
);

create table public.capture_tags (
  capture_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null default private.current_user_id(),
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

revoke execute on function private.set_updated_at() from public;

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


-- Every application query uses refer_app within a transaction with an owner ID.
-- Neither anonymous users nor the Data API are granted table access.
alter table public.profiles enable row level security;
revoke all on public.profiles from public;
grant select, insert, update, delete on public.profiles to refer_app;
create policy profiles_owner on public.profiles to refer_app
using (id = (select private.current_user_id()))
with check (id = (select private.current_user_id()));
alter table public.collections enable row level security;
revoke all on public.collections from public;
grant select, insert, update, delete on public.collections to refer_app;
create policy collections_owner on public.collections to refer_app
using (user_id = (select private.current_user_id()))
with check (user_id = (select private.current_user_id()));
alter table public.captures enable row level security;
revoke all on public.captures from public;
grant select, insert, update, delete on public.captures to refer_app;
create policy captures_owner on public.captures to refer_app
using (user_id = (select private.current_user_id()))
with check (user_id = (select private.current_user_id()));
alter table public.tags enable row level security;
revoke all on public.tags from public;
grant select, insert, update, delete on public.tags to refer_app;
create policy tags_owner on public.tags to refer_app
using (user_id = (select private.current_user_id()))
with check (user_id = (select private.current_user_id()));
alter table public.capture_tags enable row level security;
revoke all on public.capture_tags from public;
grant select, insert, update, delete on public.capture_tags to refer_app;
create policy capture_tags_owner on public.capture_tags to refer_app
using (user_id = (select private.current_user_id()))
with check (user_id = (select private.current_user_id()));

create table private.extension_codes (
  code_hash text primary key,
  user_id uuid not null references public.accounts(id) on delete cascade,
  challenge text not null,
  redirect_uri text not null,
  expires_at timestamptz not null default now() + interval '2 minutes'
);
create table private.extension_sessions (
  token_hash text primary key,
  user_id uuid not null references public.accounts(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days'
);
revoke all on private.extension_codes, private.extension_sessions from public, refer_app;
