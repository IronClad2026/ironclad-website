-- Forward-only evidence fix. No replay/backfill of existing competition rows.
-- Preserve legacy Main (displayed as Main / Pro); Pro belongs only to the
-- immutable four-Division model. Existing result/evidence rules are unchanged.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.record_tournament_championship_path_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tournament_id uuid;
  v_round_number integer;
  v_expected_count integer;
  v_slot_count integer;
  v_round_count integer;
  v_min_round integer;
  v_max_round integer;
  v_topology_valid boolean;
  v_outcome record;
  v_registration_id uuid;
begin
  select bracket.tournament_id, round.round_number
  into v_tournament_id, v_round_number
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  join public.tournament_brackets as bracket
    on bracket.id = generated.tournament_bracket_id
  join public.tournaments as tournament
    on tournament.id = bracket.tournament_id
  where round.id = new.round_id
    and generated.format = 'single_elimination'
    and bracket.launched_at is not null
    and (
      bracket.name in ('Academy', 'Challenge', 'Main')
      or (
        bracket.name = 'Pro'
        and tournament.division_model_version = 'four_division_v1'
      )
    );

  if v_tournament_id is null or new.outcome_type = 'empty_feeder' then
    return new;
  end if;

  select
    generated.slot_count,
    count(*)::integer,
    min(round.round_number),
    max(round.round_number)
  into v_slot_count, v_round_count, v_min_round, v_max_round
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  where round.generated_bracket_id = new.generated_bracket_id
  group by generated.slot_count;

  v_topology_valid :=
    v_slot_count >= 2
    and v_round_count > 0
    and v_min_round = 1
    and v_max_round = v_round_count
    and v_slot_count = pg_catalog.power(2, v_round_count)::integer;

  -- The supported single-elimination generator uses complete power-of-two
  -- round topology. Unknown or malformed topology remains incomplete.
  if not coalesce(v_topology_valid, false) then
    return new;
  end if;

  v_expected_count := v_round_count;

  foreach v_registration_id in array ARRAY[
    new.player_one_registration_id,
    new.player_two_registration_id
  ] loop
    if v_registration_id is not null then
      select authority.outcome_kind, authority.finalized_at
      into v_outcome
      from public.match_participant_outcome_authority as authority
      where authority.match_id = new.id
        and authority.registration_id = v_registration_id
      order by authority.revision desc, authority.id desc
      limit 1;

      if v_outcome.outcome_kind is not null then
        perform public.append_tournament_championship_path_authority(
          v_tournament_id,
          v_registration_id,
          v_round_number,
          v_round_number,
          v_expected_count,
          new.id,
          new.generated_bracket_id,
          new.round_id,
          v_outcome.outcome_kind,
          'active',
          v_outcome.finalized_at,
          'match_authority',
          new.id,
          jsonb_build_object(
            'pathAuthorityOnly', true,
            'matchStatus', new.status
          )
        );
      end if;
    end if;
  end loop;

  return new;
end;
$$;

alter function public.record_tournament_championship_path_authority()
  owner to postgres;

revoke all on function public.record_tournament_championship_path_authority()
  from public, anon, authenticated, service_role;

commit;
