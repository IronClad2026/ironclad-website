begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The combined application uses these service-only read surfaces. Preserve
-- the live public profile policy, including the settled Pro leaderboard.
-- The separate versioned publication transition is excluded from this release.
do $$
begin
  if to_regclass('ironclad_private.leaderboard_qualified_season_events') is null
    or to_regprocedure('ironclad_private.patch2_account_state(text)') is null
    or to_regclass('public.gaming_profile_disclosure') is not null
    or to_regprocedure('public.get_gaming_profile_avatar_target(uuid,text)') is not null then
    raise exception 'Unexpected live profile disclosure predecessor' using errcode = '55000';
  end if;
end;
$$;

create view public.gaming_profile_disclosure with (security_barrier = true, security_invoker = false) as
select p.id, p.clerk_user_id, p.account_closed_at,
  case when p.account_closed_at is null then p.in_game_name end as in_game_name,
  case when p.account_closed_at is null then p.display_name end as display_name,
  case when p.account_closed_at is null then p.coh3_profile_id end as coh3_profile_id,
  p.account_closed_at is null as profile_public,
  p.account_closed_at is null as optional_public
from public.players p;
alter view public.gaming_profile_disclosure owner to postgres;
revoke all on public.gaming_profile_disclosure from public, anon, authenticated, service_role;
grant select on public.gaming_profile_disclosure to service_role;

create function public.get_gaming_profile_avatar_target(p_player_id uuid, p_viewer_subject text)
returns text language sql stable security definer set search_path = pg_catalog as $$
  select p.clerk_user_id from public.players p
  where auth.role() = 'service_role' and p.id = p_player_id and p.account_closed_at is null
    and p.avatar_url is not null
    and ironclad_private.patch2_account_state(p.clerk_user_id) = 'active-player';
$$;
alter function public.get_gaming_profile_avatar_target(uuid,text) owner to postgres;
revoke all on function public.get_gaming_profile_avatar_target(uuid,text) from public, anon, authenticated;
grant execute on function public.get_gaming_profile_avatar_target(uuid,text) to service_role;

commit;
