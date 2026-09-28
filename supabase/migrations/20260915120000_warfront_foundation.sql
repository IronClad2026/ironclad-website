begin;

-- WARFRONT Companies are durable competitive identities. A Company is
-- archived rather than deleted once membership or invitation history exists.
create table public.warfront_companies (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null,
  tag text not null,
  slug text not null,
  description text,
  region text,
  logo_path text,
  banner_path text,
  status text not null default 'active',
  founded_at timestamptz not null default pg_catalog.now(),
  archived_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint warfront_companies_name_check check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 80
    and name !~ '[[:cntrl:]]'
  ),
  constraint warfront_companies_tag_check check (
    tag = pg_catalog.btrim(tag)
    and pg_catalog.char_length(tag) between 2 and 12
    and tag !~ '[[:cntrl:]]'
  ),
  constraint warfront_companies_slug_check check (
    slug = pg_catalog.btrim(slug)
    and pg_catalog.char_length(slug) between 2 and 80
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint warfront_companies_description_check check (
    description is null
    or (
      description = pg_catalog.btrim(description)
      and pg_catalog.char_length(description) between 1 and 1000
      and pg_catalog.replace(
        pg_catalog.replace(description, pg_catalog.chr(10), ''),
        pg_catalog.chr(13),
        ''
      ) !~ '[[:cntrl:]]'
    )
  ),
  constraint warfront_companies_region_check check (
    region is null
    or (
      region = pg_catalog.btrim(region)
      and pg_catalog.char_length(region) between 1 and 80
      and region !~ '[[:cntrl:]]'
    )
  ),
  constraint warfront_companies_logo_path_check check (
    logo_path is null
    or (
      logo_path = pg_catalog.btrim(logo_path)
      and pg_catalog.char_length(logo_path) between 1 and 1024
      and logo_path !~ '[[:cntrl:]]'
    )
  ),
  constraint warfront_companies_banner_path_check check (
    banner_path is null
    or (
      banner_path = pg_catalog.btrim(banner_path)
      and pg_catalog.char_length(banner_path) between 1 and 1024
      and banner_path !~ '[[:cntrl:]]'
    )
  ),
  constraint warfront_companies_status_check check (
    status in ('active', 'archived')
  ),
  constraint warfront_companies_archive_state_check check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  ),
  constraint warfront_companies_archive_time_check check (
    archived_at is null or archived_at >= founded_at
  ),
  constraint warfront_companies_updated_at_check check (
    updated_at >= created_at
  )
);

create unique index warfront_companies_name_ci_key
  on public.warfront_companies((pg_catalog.lower(name)));

create unique index warfront_companies_tag_ci_key
  on public.warfront_companies((pg_catalog.lower(tag)));

create unique index warfront_companies_slug_key
  on public.warfront_companies(slug);

create index warfront_companies_status_founded_idx
  on public.warfront_companies(status, founded_at desc, id);

-- Each row is one durable membership interval. Leaving closes the interval;
-- it does not delete the row. Role changes within an interval do not create a
-- separate role-history model in this foundation.
create table public.warfront_company_members (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  company_id uuid not null
    references public.warfront_companies(id) on delete restrict,
  player_id uuid not null
    references public.players(id) on delete restrict,
  role text not null,
  joined_at timestamptz not null default pg_catalog.now(),
  left_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint warfront_company_members_role_check check (
    role in ('commander', 'officer', 'member')
  ),
  constraint warfront_company_members_membership_time_check check (
    left_at is null or left_at >= joined_at
  ),
  constraint warfront_company_members_updated_at_check check (
    updated_at >= created_at
  )
);

create unique index warfront_company_members_one_active_company_per_player_idx
  on public.warfront_company_members(player_id)
  where left_at is null;

create unique index warfront_company_members_one_active_commander_idx
  on public.warfront_company_members(company_id)
  where left_at is null and role = 'commander';

create index warfront_company_members_active_company_idx
  on public.warfront_company_members(company_id, joined_at, id)
  where left_at is null;

-- Invitations have no automatic expiry in WARFRONT V1. Resolution is durable
-- and exactly one status-specific timestamp is populated.
create table public.warfront_company_invitations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  company_id uuid not null
    references public.warfront_companies(id) on delete restrict,
  recipient_player_id uuid not null
    references public.players(id) on delete cascade,
  invited_by_player_id uuid not null
    references public.players(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  constraint warfront_company_invitations_status_check check (
    status in ('pending', 'accepted', 'declined', 'invalidated')
  ),
  constraint warfront_company_invitations_invalidation_reason_check check (
    invalidation_reason is null
    or invalidation_reason in (
      'account_closed',
      'already_in_company',
      'company_archived',
      'inviter_no_longer_authorized',
      'revoked'
    )
  ),
  constraint warfront_company_invitations_resolution_state_check check (
    (status = 'pending'
      and accepted_at is null
      and declined_at is null
      and invalidated_at is null
      and invalidation_reason is null)
    or (status = 'accepted'
      and accepted_at is not null
      and declined_at is null
      and invalidated_at is null
      and invalidation_reason is null)
    or (status = 'declined'
      and accepted_at is null
      and declined_at is not null
      and invalidated_at is null
      and invalidation_reason is null)
    or (status = 'invalidated'
      and accepted_at is null
      and declined_at is null
      and invalidated_at is not null
      and invalidation_reason is not null)
  ),
  constraint warfront_company_invitations_resolution_time_check check (
    (accepted_at is null or accepted_at >= created_at)
    and (declined_at is null or declined_at >= created_at)
    and (invalidated_at is null or invalidated_at >= created_at)
  )
);

create unique index warfront_company_invitations_one_pending_company_recipient_idx
  on public.warfront_company_invitations(company_id, recipient_player_id)
  where status = 'pending';

create index warfront_company_invitations_pending_recipient_idx
  on public.warfront_company_invitations(
    recipient_player_id,
    created_at desc,
    id
  )
  where status = 'pending';

create index warfront_company_invitations_pending_company_idx
  on public.warfront_company_invitations(
    company_id,
    created_at desc,
    id
  )
  where status = 'pending';

drop trigger if exists warfront_companies_set_updated_at
  on public.warfront_companies;
create trigger warfront_companies_set_updated_at
before update on public.warfront_companies
for each row execute function public.ironclad_set_updated_at();

drop trigger if exists warfront_company_members_set_updated_at
  on public.warfront_company_members;
create trigger warfront_company_members_set_updated_at
before update on public.warfront_company_members
for each row execute function public.ironclad_set_updated_at();

alter table public.warfront_companies enable row level security;
alter table public.warfront_companies force row level security;
alter table public.warfront_companies owner to postgres;

alter table public.warfront_company_members enable row level security;
alter table public.warfront_company_members force row level security;
alter table public.warfront_company_members owner to postgres;

alter table public.warfront_company_invitations enable row level security;
alter table public.warfront_company_invitations force row level security;
alter table public.warfront_company_invitations owner to postgres;

revoke all on table public.warfront_companies
  from public, anon, authenticated, service_role;
revoke all on table public.warfront_company_members
  from public, anon, authenticated, service_role;
revoke all on table public.warfront_company_invitations
  from public, anon, authenticated, service_role;

grant select on table public.warfront_companies to service_role;
grant select on table public.warfront_company_members to service_role;
grant select on table public.warfront_company_invitations to service_role;

comment on table public.warfront_companies is
  'Private operational WARFRONT Company identities. Public Company projections are intentionally deferred.';
comment on table public.warfront_company_members is
  'Private durable WARFRONT Company membership intervals. A future authoritative membership RPC must reject closed players, validate Company state and preserve commander continuity.';
comment on table public.warfront_company_invitations is
  'Private durable WARFRONT Company invitations. Future authorities must validate inviter authority and atomically accept membership while invalidating incompatible pending invitations.';

commit;
