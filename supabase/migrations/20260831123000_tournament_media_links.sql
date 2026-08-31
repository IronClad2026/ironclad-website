begin;

create table public.tournament_media (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tournament_id uuid not null
    references public.tournaments(id) on delete cascade,
  title text not null,
  url text not null,
  media_type text not null,
  description text,
  match_id uuid
    references public.tournament_matches(id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint tournament_media_title_check check (
    title = pg_catalog.btrim(title)
    and char_length(title) between 1 and 160
    and title !~ '[[:cntrl:]]'
  ),
  constraint tournament_media_url_check check (
    url = pg_catalog.btrim(url)
    and char_length(url) between 1 and 2048
    and url ~* '^https://[^[:space:][:cntrl:]]+$'
  ),
  constraint tournament_media_type_check check (
    media_type in ('full_tournament', 'match_cast', 'video', 'other')
  ),
  constraint tournament_media_description_check check (
    description is null
    or (
      description = pg_catalog.btrim(description)
      and char_length(description) between 1 and 500
      and pg_catalog.replace(
        pg_catalog.replace(description, pg_catalog.chr(10), ''),
        pg_catalog.chr(13),
        ''
      ) !~ '[[:cntrl:]]'
    )
  ),
  constraint tournament_media_updated_at_check check (
    updated_at >= created_at
  )
);

comment on table public.tournament_media is
  'Admin-curated external media links for one Tournament. Hidden links remain Admin-only; published links may be projected by the trusted public Tournament server boundary.';
comment on column public.tournament_media.match_id is
  'Optional Match context. The trusted Admin action validates that the Match belongs to tournament_id before saving.';
comment on column public.tournament_media.published is
  'False by default so a newly created link is never public before an Admin deliberately publishes it.';

create index tournament_media_tournament_newest_idx
  on public.tournament_media(
    tournament_id,
    published,
    created_at desc,
    id desc
  );

create index tournament_media_match_idx
  on public.tournament_media(match_id)
  where match_id is not null;

drop trigger if exists tournament_media_set_updated_at
  on public.tournament_media;
create trigger tournament_media_set_updated_at
before update on public.tournament_media
for each row execute function public.ironclad_set_updated_at();

alter table public.tournament_media enable row level security;
alter table public.tournament_media force row level security;

revoke all on table public.tournament_media
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.tournament_media
  to service_role;

commit;
