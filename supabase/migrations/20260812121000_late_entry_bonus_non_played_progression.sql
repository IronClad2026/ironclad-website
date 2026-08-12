begin;

create or replace function public.is_valid_late_entry_participation(
  p_tournament_id uuid,
  p_tournament_bracket_id uuid,
  p_registration_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.tournaments as tournament
    join public.tournament_brackets as bracket
      on bracket.id = p_tournament_bracket_id
      and bracket.tournament_id = tournament.id
    join public.registrations as registration
      on registration.id = p_registration_id
      and registration.tournament_id = tournament.id
      and registration.tournament_bracket_id = bracket.id
    join public.players as player
      on player.id = registration.profile_id
    where tournament.id = p_tournament_id
      and tournament.status = 'completed'
      and bracket.name in ('Academy', 'Challenge')
      and bracket.launched_at is not null
      and registration.registration_status = 'approved'
      and not public.is_registration_confirmed_no_show_for_leaderboard(
        tournament.id,
        bracket.id,
        registration.id
      )
  );
$$;

alter function public.is_valid_late_entry_participation(uuid, uuid, uuid)
  owner to postgres;
revoke all on function
  public.is_valid_late_entry_participation(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

commit;
