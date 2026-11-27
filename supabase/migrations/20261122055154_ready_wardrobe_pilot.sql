begin;

-- Phase 1 preview data only. The application serves clear media after account
-- authorization. A private bucket with no new object policies keeps access on
-- the service-role Storage path.
insert into storage.buckets (id, name, public)
values ('ready-wardrobe-pilot', 'ready-wardrobe-pilot', false);

create table public.ready_wardrobe_pilot_profiles (
  clerk_user_id text primary key
    check (clerk_user_id ~ '[^[:space:]]'),
  item_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint ready_wardrobe_pilot_profiles_valid_items check (
    case when coalesce(array_ndims(item_ids), 1) <> 1
           or coalesce(array_lower(item_ids, 1), 1) <> 1 then false
      else
        item_ids <@ array['eyewear_smoked_aviators', 'mouth_cigarette', 'face_clown_makeup']::text[]
        and array_position(item_ids, null) is null
        and cardinality(item_ids) = (
          (array_position(item_ids, 'eyewear_smoked_aviators') is not null)::integer
          + (array_position(item_ids, 'mouth_cigarette') is not null)::integer
          + (array_position(item_ids, 'face_clown_makeup') is not null)::integer
        )
    end
  ),
  constraint ready_wardrobe_pilot_profiles_compatible_items check (
    not (item_ids @> array['mouth_cigarette', 'face_clown_makeup']::text[])
  )
);

create table public.ready_wardrobe_pilot_coverage (
  clerk_user_id text primary key
    check (clerk_user_id ~ '[^[:space:]]'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  constraint ready_wardrobe_pilot_coverage_finite_window check (
    isfinite(starts_at) and isfinite(ends_at) and starts_at < ends_at
  )
);

alter table public.ready_wardrobe_pilot_profiles enable row level security;
alter table public.ready_wardrobe_pilot_coverage enable row level security;

revoke all on public.ready_wardrobe_pilot_profiles, public.ready_wardrobe_pilot_coverage
  from public, anon, authenticated, service_role;
grant select, insert, update on public.ready_wardrobe_pilot_profiles to service_role;
grant select on public.ready_wardrobe_pilot_coverage to service_role;

comment on table public.ready_wardrobe_pilot_profiles is
  'Phase 1 loadouts. Server authorizes the current account on each read or save.';
comment on table public.ready_wardrobe_pilot_coverage is
  'Time-bounded Staging UAT fixtures managed by the trusted database owner. No billing or tournament entitlements.';

commit;
