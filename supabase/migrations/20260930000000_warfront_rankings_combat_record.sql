begin;

-- M11 is a public-safe read/projection layer. M9 remains the result source and
-- M10 remains the settled accounting boundary; this migration creates no facts.
create function ironclad_private.warfront_public_operation_roster_projection(
  p_operation_id uuid,
  p_side text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'playerId', case
          when player.account_closed_at is null
            and player.public_profile_enabled then player.id
          else null::uuid
        end,
        'displayName', case
          when player.account_closed_at is not null then 'Former Competitor'
          when player.public_profile_enabled then player.display_name
          else player.in_game_name
        end,
        'eloSnapshot', entry.elo_snapshot
      )
      order by entry.selected_at asc, entry.id asc
    ),
    '[]'::jsonb
  )
  from public.warfront_operation_roster_entries as entry
  join public.players as player
    on player.id = entry.player_id
  where entry.operation_id = p_operation_id
    and entry.side = p_side;
$$;

create function public.get_warfront_company_rankings(
  p_scope text,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_rows jsonb;
  v_total bigint;
  v_returned integer;
begin
  if p_scope is null
    or p_scope not in ('overall', '2v2', '3v3', '4v4')
    or p_offset is null
    or p_offset < 0
    or p_offset > 10000
    or p_limit is null
    or p_limit not between 1 and 100 then
    raise exception 'WARFRONT_RANKINGS_INPUT_INVALID'
      using errcode = '22023';
  end if;

  with scoped_entries as (
    select
      ledger.operation_id,
      ledger.company_id,
      ledger.outcome,
      ledger.points_delta,
      operation.format,
      case ledger.side
        when 'challenger' then operation.opponent_roster_elo_snapshot
        when 'opponent' then operation.challenger_roster_elo_snapshot
      end as opponent_roster_elo_snapshot
    from public.warfront_company_point_ledger_entries as ledger
    join public.warfront_operation_point_settlements as settlement
      on settlement.operation_id = ledger.operation_id
    join public.warfront_operations as operation
      on operation.id = settlement.operation_id
    where p_scope = 'overall' or operation.format = p_scope
  ),
  statistics as (
    select
      company.id as company_id,
      company.name as company_name,
      company.tag as company_tag,
      company.logo_path as company_logo,
      company.region,
      company.created_at as company_created_at,
      coalesce(sum(entry.points_delta), 0)::bigint as points,
      count(*) filter (where entry.outcome = 'win')::bigint as wins,
      count(*) filter (where entry.outcome = 'loss')::bigint as losses,
      count(*)::bigint as played,
      round(
        (count(*) filter (where entry.outcome = 'win'))::numeric
          / count(*)::numeric,
        6
      )::numeric(9, 6) as win_rate,
      round(avg(entry.opponent_roster_elo_snapshot), 4)::numeric(9, 4)
        as strength_of_schedule
    from scoped_entries as entry
    join public.warfront_companies as company
      on company.id = entry.company_id
     and company.status = 'active'
    group by
      company.id,
      company.name,
      company.tag,
      company.logo_path,
      company.region,
      company.created_at
  ),
  ranked as (
    select
      statistics.*,
      row_number() over (
        order by
          points desc,
          wins desc,
          win_rate desc,
          strength_of_schedule desc nulls last,
          company_created_at asc,
          company_id asc
      )::bigint as rank,
      count(*) over ()::bigint as total_count
    from statistics
  ),
  page as (
    select *
    from ranked
    order by rank asc
    offset p_offset
    limit p_limit
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank', page.rank,
          'companyId', page.company_id,
          'companyName', page.company_name,
          'companyTag', page.company_tag,
          'companyLogo', page.company_logo,
          'region', page.region,
          'points', page.points,
          'wins', page.wins,
          'losses', page.losses,
          'played', page.played,
          'winRate', page.win_rate,
          'strengthOfSchedule', page.strength_of_schedule
        )
        order by page.rank asc
      ),
      '[]'::jsonb
    ),
    coalesce(max(page.total_count), 0),
    count(*)::integer
  into v_rows, v_total, v_returned
  from page;

  return jsonb_build_object(
    'scope', p_scope,
    'offset', p_offset,
    'limit', p_limit,
    'total', v_total,
    'hasMore', p_offset + v_returned < v_total,
    'rankings', v_rows
  );
end;
$$;

create function public.get_warfront_company_combat_record(
  p_company_id uuid,
  p_before_settled_at timestamptz default null,
  p_before_operation_id uuid default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_company public.warfront_companies%rowtype;
  v_records jsonb;
  v_has_more boolean;
  v_next_settled_at timestamptz;
  v_next_operation_id uuid;
begin
  if p_company_id is null
    or (p_before_settled_at is null) is distinct from
       (p_before_operation_id is null)
    or p_limit is null
    or p_limit not between 1 and 50 then
    raise exception 'WARFRONT_COMBAT_RECORD_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select company.* into v_company
  from public.warfront_companies as company
  where company.id = p_company_id;

  if not found then
    raise exception 'WARFRONT_COMPANY_UNAVAILABLE'
      using errcode = '42501';
  end if;

  with candidate as (
    select
      settlement.settled_at,
      ledger.operation_id,
      ledger.side,
      ledger.outcome,
      ledger.points_delta,
      operation.format,
      operation.series_best_of,
      operation.challenger_company_id,
      operation.opponent_company_id,
      operation.challenger_roster_elo_snapshot,
      operation.opponent_roster_elo_snapshot,
      finalization.final_challenger_wins,
      finalization.final_opponent_wins,
      finalization.finalized_at
    from public.warfront_company_point_ledger_entries as ledger
    join public.warfront_operation_point_settlements as settlement
      on settlement.operation_id = ledger.operation_id
    join public.warfront_operations as operation
      on operation.id = settlement.operation_id
    join public.warfront_operation_result_finalizations as finalization
      on finalization.operation_id = operation.id
    where ledger.company_id = v_company.id
      and (
        p_before_settled_at is null
        or (settlement.settled_at, ledger.operation_id) < (
          p_before_settled_at,
          p_before_operation_id
        )
      )
    order by settlement.settled_at desc, ledger.operation_id desc
    limit p_limit + 1
  ),
  page as (
    select *
    from candidate
    order by settled_at desc, operation_id desc
    limit p_limit
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'operationId', page.operation_id,
          'settledAt', page.settled_at,
          'finalizedAt', page.finalized_at,
          'format', page.format,
          'seriesBestOf', page.series_best_of,
          'side', page.side,
          'outcome', page.outcome,
          'pointsDelta', page.points_delta,
          'score', jsonb_build_object(
            'companyWins', case page.side
              when 'challenger' then page.final_challenger_wins
              else page.final_opponent_wins
            end,
            'opponentWins', case page.side
              when 'challenger' then page.final_opponent_wins
              else page.final_challenger_wins
            end
          ),
          'opponent', jsonb_build_object(
            'companyId', opponent.id,
            'name', opponent.name,
            'tag', opponent.tag,
            'logo', opponent.logo_path
          ),
          'companyRoster', ironclad_private.warfront_public_operation_roster_projection(
            page.operation_id,
            page.side
          ),
          'opponentRoster', ironclad_private.warfront_public_operation_roster_projection(
            page.operation_id,
            case page.side
              when 'challenger' then 'opponent'
              else 'challenger'
            end
          ),
          'companyRosterEloSnapshot', case page.side
            when 'challenger' then page.challenger_roster_elo_snapshot
            else page.opponent_roster_elo_snapshot
          end,
          'opponentRosterEloSnapshot', case page.side
            when 'challenger' then page.opponent_roster_elo_snapshot
            else page.challenger_roster_elo_snapshot
          end
        )
        order by page.settled_at desc, page.operation_id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) > p_limit from candidate),
    (
      select page.settled_at
      from page
      order by page.settled_at asc, page.operation_id asc
      limit 1
    ),
    (
      select page.operation_id
      from page
      order by page.settled_at asc, page.operation_id asc
      limit 1
    )
  into v_records, v_has_more, v_next_settled_at, v_next_operation_id
  from page
  join public.warfront_companies as opponent
    on opponent.id = case page.side
      when 'challenger' then page.opponent_company_id
      else page.challenger_company_id
    end;

  if not v_has_more then
    v_next_settled_at := null;
    v_next_operation_id := null;
  end if;

  return jsonb_build_object(
    'companyId', v_company.id,
    'records', v_records,
    'page', jsonb_build_object(
      'limit', p_limit,
      'hasMore', coalesce(v_has_more, false),
      'nextBeforeSettledAt', v_next_settled_at,
      'nextBeforeOperationId', v_next_operation_id
    )
  );
end;
$$;

create function public.get_warfront_company_summary(
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_company public.warfront_companies%rowtype;
  v_scopes jsonb;
begin
  if p_company_id is null then
    raise exception 'WARFRONT_COMPANY_SUMMARY_INPUT_INVALID'
      using errcode = '22023';
  end if;

  select company.* into v_company
  from public.warfront_companies as company
  where company.id = p_company_id;

  if not found then
    raise exception 'WARFRONT_COMPANY_UNAVAILABLE'
      using errcode = '42501';
  end if;

  with scopes(scope) as (
    values ('overall'::text), ('2v2'::text), ('3v3'::text), ('4v4'::text)
  )
  select jsonb_object_agg(
    scopes.scope,
    jsonb_build_object(
      'points', statistics.points,
      'wins', statistics.wins,
      'losses', statistics.losses,
      'played', statistics.played,
      'winRate', statistics.win_rate,
      'strengthOfSchedule', statistics.strength_of_schedule
    )
  ) into v_scopes
  from scopes
  cross join lateral (
    select
      coalesce(sum(ledger.points_delta), 0)::bigint as points,
      count(*) filter (where ledger.outcome = 'win')::bigint as wins,
      count(*) filter (where ledger.outcome = 'loss')::bigint as losses,
      count(*)::bigint as played,
      case when count(*) = 0 then 0::numeric(9, 6) else round(
        (count(*) filter (where ledger.outcome = 'win'))::numeric
          / count(*)::numeric,
        6
      )::numeric(9, 6) end as win_rate,
      round(
        avg(case ledger.side
          when 'challenger' then operation.opponent_roster_elo_snapshot
          when 'opponent' then operation.challenger_roster_elo_snapshot
        end),
        4
      )::numeric(9, 4) as strength_of_schedule
    from public.warfront_company_point_ledger_entries as ledger
    join public.warfront_operation_point_settlements as settlement
      on settlement.operation_id = ledger.operation_id
    join public.warfront_operations as operation
      on operation.id = settlement.operation_id
    where ledger.company_id = v_company.id
      and (scopes.scope = 'overall' or operation.format = scopes.scope)
  ) as statistics;

  return jsonb_build_object('companyId', v_company.id) || v_scopes;
end;
$$;

alter function ironclad_private.warfront_public_operation_roster_projection(uuid,text)
  owner to postgres;
alter function public.get_warfront_company_rankings(text,integer,integer)
  owner to postgres;
alter function public.get_warfront_company_combat_record(uuid,timestamptz,uuid,integer)
  owner to postgres;
alter function public.get_warfront_company_summary(uuid)
  owner to postgres;

revoke all on function ironclad_private.warfront_public_operation_roster_projection(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_warfront_company_rankings(text,integer,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_warfront_company_combat_record(uuid,timestamptz,uuid,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_warfront_company_summary(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_warfront_company_rankings(text,integer,integer),
  public.get_warfront_company_combat_record(uuid,timestamptz,uuid,integer),
  public.get_warfront_company_summary(uuid)
  to anon, authenticated, service_role;

comment on function public.get_warfront_company_rankings(text,integer,integer) is
  'Public-safe, read-only WARFRONT Company rankings. It derives only M10 settled ledger facts, filters archived Companies, and never exposes raw competitive tables.';
comment on function public.get_warfront_company_combat_record(uuid,timestamptz,uuid,integer) is
  'Public-safe, read-only normalized WARFRONT Company Combat Record. It derives only M10 settled operations and applies established closed/private Player presentation semantics to immutable rosters.';
comment on function public.get_warfront_company_summary(uuid) is
  'Public-safe, read-only all-scope WARFRONT Company competitive summary derived only from M10 settled ledger facts.';

commit;
