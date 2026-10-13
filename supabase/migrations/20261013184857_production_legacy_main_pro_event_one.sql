-- Production forward reconciliation from verified base 0114b1c9f4908c0f8a0e43cfa7a25fb96d361fd1.
-- Approved one-time continuation: immutable legacy Main source, official Pro season Event 1.
-- Inert until exact app/legal verification and the separately authorized postdeployment activation.
-- No historical row is relabelled, copied, removed or rescored. No ELO threshold is reapplied.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
set local timezone='UTC';
select pg_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time',0));

create table ironclad_private.legacy_main_pro_season_transition (
 singleton boolean primary key default true check(singleton),
 season_id uuid not null unique references public.leaderboard_seasons(id) on delete restrict
   check(season_id='003db606-b891-4f4e-8893-a54dd4cd503c'::uuid),
 tournament_id uuid not null unique references public.tournaments(id) on delete restrict
   check(tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid),
 tournament_bracket_id uuid not null unique references public.tournament_brackets(id) on delete restrict
   check(tournament_bracket_id='f34400e9-f7c8-43ac-90dc-6c70b438a04d'::uuid),
 policy text not null check(policy='legacy-main-pro-event-one-v1'),
 recorded_at timestamptz not null default clock_timestamp(),
 activated_at timestamptz,
 source_point_sha256 text not null check(source_point_sha256 ~ '^[a-f0-9]{64}$'),
 source_settlement_sha256 text not null check(source_settlement_sha256 ~ '^[a-f0-9]{64}$'),
 source_membership_sha256 text not null check(source_membership_sha256 ~ '^[a-f0-9]{64}$')
);
alter table ironclad_private.legacy_main_pro_season_transition owner to postgres;
alter table ironclad_private.legacy_main_pro_season_transition enable row level security;
revoke all on ironclad_private.legacy_main_pro_season_transition from public,anon,authenticated,service_role;

-- Exact source checks precede the sole inert mapping. Any ambiguity stops the atomic package.
do $source$ begin
 if not exists(select 1 from public.leaderboard_seasons s
   where s.id='003db606-b891-4f4e-8893-a54dd4cd503c'::uuid and s.official_bracket_type='main'
     and s.year=2026 and s.season_number=1 and s.is_active and s.finalized_at is null and s.under_review_at is null)
 or not exists(select 1 from public.tournaments t
   where t.id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid and t.division_model_version='legacy_three_v1'
     and t.status='completed' and t.first_completed_at is not null)
 or not exists(select 1 from public.tournament_brackets b
   where b.id='f34400e9-f7c8-43ac-90dc-6c70b438a04d'::uuid and b.tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid
     and b.name='Main' and b.launched_at is not null)
 or (select count(*) from public.leaderboard_tournament_season_memberships where season_id='003db606-b891-4f4e-8893-a54dd4cd503c'::uuid)<>1
 or not exists(select 1 from public.leaderboard_tournament_season_memberships m
   where m.season_id='003db606-b891-4f4e-8893-a54dd4cd503c'::uuid and m.tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid
     and m.qualifying_event_number=1 and m.scored_at is not null and m.voided_at is null)
 or exists(select 1 from public.leaderboard_season_champions where season_id='003db606-b891-4f4e-8893-a54dd4cd503c'::uuid)
 or (select count(*) from public.tournament_matches m join public.generated_brackets g on g.id=m.generated_bracket_id
     join public.tournament_brackets b on b.id=g.tournament_bracket_id where b.tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid and m.status='completed')<>21
 or (select count(*) from public.leaderboard_division_settlements x join public.tournament_brackets b on b.id=x.tournament_bracket_id
     where b.tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid and x.season_id='003db606-b891-4f4e-8893-a54dd4cd503c'::uuid
       and x.settled_at is not null and x.calculation_checksum is not null)<>3
 or (select count(*) from public.leaderboard_point_events where tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid)<>45
 or (select count(*) from public.leaderboard_point_events e left join public.registrations r on r.id=e.registration_id and r.profile_id=e.player_id
     where e.tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid and e.season_id='003db606-b891-4f4e-8893-a54dd4cd503c'::uuid and e.bracket_type='main'
       and coalesce(e.tournament_bracket_id,r.tournament_bracket_id)='f34400e9-f7c8-43ac-90dc-6c70b438a04d'::uuid)<>15
 or (select coalesce(sum(points),0) from public.leaderboard_point_events where tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid and bracket_type='main')<>105
 then raise exception 'Approved legacy Main Event 1 source is missing or ambiguous; STOP' using errcode='55000'; end if;
end; $source$;
insert into ironclad_private.legacy_main_pro_season_transition(singleton,season_id,tournament_id,tournament_bracket_id,policy,source_point_sha256,source_settlement_sha256,source_membership_sha256)
select true,'003db606-b891-4f4e-8893-a54dd4cd503c'::uuid,'1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid,'f34400e9-f7c8-43ac-90dc-6c70b438a04d'::uuid,'legacy-main-pro-event-one-v1',
 (select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text,'UTF8')),'hex') from public.leaderboard_point_events p where p.tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid),
 (select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) order by x.tournament_bracket_id),'[]'::jsonb)::text,'UTF8')),'hex') from public.leaderboard_division_settlements x join public.tournament_brackets b on b.id=x.tournament_bracket_id where b.tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid),
 (select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(m) order by m.tournament_id),'[]'::jsonb)::text,'UTF8')),'hex') from public.leaderboard_tournament_season_memberships m where m.tournament_id='1cb06045-0ffc-4745-a8cd-1a16b71baffc'::uuid);

create function ironclad_private.guard_legacy_main_pro_transition()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
 if tg_op<>'UPDATE' or old.activated_at is not null or new.activated_at is null
   or (to_jsonb(new)-'activated_at') is distinct from (to_jsonb(old)-'activated_at') then
   raise exception 'One-time season transition metadata is immutable' using errcode='55000'; end if;
 return new;
end $$;
revoke all on function ironclad_private.guard_legacy_main_pro_transition() from public,anon,authenticated,service_role;
create trigger legacy_main_pro_transition_immutable before insert or update or delete on ironclad_private.legacy_main_pro_season_transition
 for each row execute function ironclad_private.guard_legacy_main_pro_transition();

create function ironclad_private.leaderboard_official_season_role(p_season_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
 select case when exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=s.id and x.activated_at is not null)
   then 'pro'::text else s.official_bracket_type end from public.leaderboard_seasons s where s.id=p_season_id;
$$;
revoke all on function ironclad_private.leaderboard_official_season_role(uuid) from public,anon,authenticated,service_role;

-- Private logical standings use real identities; only the public view below masks them.
-- No source ledger or historical standings row is rewritten to create this projection.
create view ironclad_private.leaderboard_official_season_standings with(security_barrier=true) as
with pro_events as (
 select p.* from public.leaderboard_point_events p
 join ironclad_private.legacy_main_pro_season_transition x on x.season_id=p.season_id and x.activated_at is not null
 left join public.leaderboard_tournament_season_memberships m on m.tournament_id=p.tournament_id and m.season_id=p.season_id
 left join public.tournaments t on t.id=p.tournament_id
 where p.bracket_type='pro' and (
   (p.tournament_id is null and p.source='admin') or
   (t.division_model_version='four_division_v1' and t.status='completed' and t.first_completed_at is not null
     and m.qualifying_event_number between 2 and 6 and m.scored_at is not null and m.voided_at is null)
 )
), pro_points as (
 select season_id,player_id,sum(points)::integer total_points,
 count(distinct tournament_id) filter(where event_type='participation')::integer tournaments_played,
 count(*) filter(where event_type='round_passed')::integer rounds_passed,
 count(*) filter(where event_type='tournament_win')::integer tournament_wins,max(created_at) updated_at
 from pro_events group by season_id,player_id
), pro_matches as (
 select e.season_id,e.player_id,count(distinct m.id)::integer matches_played,
 count(distinct m.id) filter(where m.winner_registration_id=e.registration_id)::integer matches_won
 from pro_events e join public.registrations r on r.id=e.registration_id and r.profile_id=e.player_id
 join public.generated_brackets g on g.tournament_bracket_id=coalesce(e.tournament_bracket_id,r.tournament_bracket_id)
 join public.tournament_matches m on m.generated_bracket_id=g.id and m.status='completed' and m.outcome_type is null
   and m.player_one_registration_id is not null and m.player_two_registration_id is not null
   and m.player_one_score is not null and m.player_two_score is not null and m.winner_registration_id is not null
   and e.registration_id in(m.player_one_registration_id,m.player_two_registration_id)
 where not exists(select 1 from public.match_result_report_groups rg where rg.match_id=m.id and rg.result_type='no_show'
   and rg.finalized_at is not null and rg.status in ('confirmed','auto_approved','approved') and rg.no_show_status in ('confirmed','auto_confirmed','approved'))
 group by e.season_id,e.player_id
), continued as (
 select s.season_id,s.player_id,s.bracket_type,s.total_points,s.tournaments_played,s.rounds_passed,s.tournament_wins,
 s.matches_played,s.matches_won,s.matches_lost,s.win_rate,s.last_tournament_id,s.last_tournament_points,s.current_rank,s.previous_rank,s.rank_movement,s.updated_at
 from public.leaderboard_player_season_stats s
 join ironclad_private.legacy_main_pro_season_transition x on x.season_id=s.season_id and x.activated_at is not null
 where s.bracket_type='main'
 union all
 select p.season_id,p.player_id,'pro'::text,p.total_points,p.tournaments_played,p.rounds_passed,p.tournament_wins,
 coalesce(m.matches_played,0),coalesce(m.matches_won,0),greatest(coalesce(m.matches_played,0)-coalesce(m.matches_won,0),0),
 (case when coalesce(m.matches_played,0)=0 then 0::numeric else round(m.matches_won::numeric/m.matches_played*100,2) end)::numeric(5,2),
 last.tournament_id,last.points,null::integer,null::integer,0,p.updated_at
 from pro_points p left join pro_matches m on m.season_id=p.season_id and m.player_id=p.player_id
 left join lateral (select e.tournament_id,sum(e.points)::integer points from pro_events e join public.tournaments t on t.id=e.tournament_id
   where e.season_id=p.season_id and e.player_id=p.player_id group by e.tournament_id,t.first_completed_at,t.created_at
   order by coalesce(t.first_completed_at,t.created_at) desc,e.tournament_id desc limit 1) last on true
), sums as (
 select season_id,player_id,'pro'::text bracket_type,
 sum(total_points)::integer total_points,sum(tournaments_played)::integer tournaments_played,
 sum(rounds_passed)::integer rounds_passed,sum(tournament_wins)::integer tournament_wins,
 sum(matches_played)::integer matches_played,sum(matches_won)::integer matches_won,sum(matches_lost)::integer matches_lost,
 (case when sum(matches_played)=0 then 0::numeric else round(sum(matches_won)::numeric/sum(matches_played)*100,2) end)::numeric(5,2) win_rate,
 max(updated_at) updated_at
 from continued group by season_id,player_id
), ranked as (
 select sums.*,rank() over(partition by season_id order by total_points desc,tournament_wins desc,rounds_passed desc,
 case when matches_played=0 then 0::numeric else matches_won::numeric/matches_played end desc,matches_won desc)::integer current_rank
 from sums
)
select s.season_id,s.player_id,s.bracket_type,s.total_points,s.tournaments_played,s.rounds_passed,s.tournament_wins,
 s.matches_played,s.matches_won,s.matches_lost,s.win_rate,s.last_tournament_id,s.last_tournament_points,
 s.current_rank,s.previous_rank,s.rank_movement,s.updated_at
from public.leaderboard_player_season_stats s join public.leaderboard_seasons season on season.id=s.season_id
where s.bracket_type=season.official_bracket_type
 and not exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=s.season_id and x.activated_at is not null)
union all
select ranked.season_id,ranked.player_id,ranked.bracket_type,ranked.total_points,ranked.tournaments_played,ranked.rounds_passed,ranked.tournament_wins,
 ranked.matches_played,ranked.matches_won,ranked.matches_lost,ranked.win_rate,last.last_tournament_id,last.last_tournament_points,
 ranked.current_rank,case when not exists(select 1 from continued c where c.season_id=ranked.season_id and c.player_id=ranked.player_id and c.bracket_type='pro') then last.previous_rank else null::integer end,
 case when not exists(select 1 from continued c where c.season_id=ranked.season_id and c.player_id=ranked.player_id and c.bracket_type='pro') then last.rank_movement else 0 end,ranked.updated_at
from ranked cross join lateral (
 select c.last_tournament_id,c.last_tournament_points,c.previous_rank,c.rank_movement
 from continued c left join public.tournaments t on t.id=c.last_tournament_id
 where c.season_id=ranked.season_id and c.player_id=ranked.player_id
 order by coalesce(t.first_completed_at,t.created_at) desc nulls last,c.last_tournament_id desc limit 1
) last;
alter view ironclad_private.leaderboard_official_season_standings owner to postgres;
revoke all on ironclad_private.leaderboard_official_season_standings from public,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.get_or_create_leaderboard_season(p_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_context_tournament_text text;
  v_context_tournament_id uuid;
  v_date date := coalesce(p_date, current_date);
  v_year integer;
  v_season_number integer;
  v_season_id uuid;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );

  v_context_tournament_text := nullif(
    pg_catalog.btrim(
      pg_catalog.current_setting(
        'ironclad.leaderboard_tournament_id',
        true
      )
    ),
    ''
  );

  if v_context_tournament_text is not null then
    begin
      v_context_tournament_id := v_context_tournament_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Invalid internal leaderboard tournament context'
          using errcode = '22023';
    end;

    select membership.season_id
    into v_season_id
    from public.leaderboard_tournament_season_memberships as membership
    where membership.tournament_id = v_context_tournament_id
      and membership.voided_at is null;

    if v_season_id is not null then
      return v_season_id;
    end if;

    raise exception 'Valid leaderboard tournament membership was not assigned'
      using errcode = '55000';
  end if;

  if exists(select 1 from ironclad_private.legacy_main_pro_season_transition where activated_at is null) then
    raise exception 'The prepared season continuation has not been activated' using errcode='55000'; end if;
  select season.id
  into v_season_id
  from public.leaderboard_seasons as season
  where season.finalized_at is null
    and season.is_active
    and ironclad_private.leaderboard_official_season_role(season.id)='pro'
    and (
      select count(*)
      from public.leaderboard_tournament_season_memberships as membership
      where membership.season_id = season.id
        and membership.qualifying_event_number is not null
        and membership.voided_at is null
    ) < 6
  order by season.created_at, season.id
  limit 1;

  if v_season_id is not null then
    return v_season_id;
  end if;

  if exists(select 1 from public.leaderboard_seasons s where s.finalized_at is null and ironclad_private.leaderboard_official_season_role(s.id)='pro') then
    raise exception 'The current Pro season still requires genuine event completion before a successor' using errcode='55000'; end if;
  v_year := extract(year from v_date)::integer;

  select coalesce(max(season.season_number), 0) + 1
  into v_season_number
  from public.leaderboard_seasons as season
  where season.year = v_year;

  insert into public.leaderboard_seasons (
    name,
    year,
    season_number,
    start_date,
    end_date,
    is_active,official_bracket_type
  )
  values (
    v_year::text || ' Pro Season ' || v_season_number::text,
    v_year,
    v_season_number,
    v_date,
    v_date,
    true,'pro'
  )
  returning id into v_season_id;

  return v_season_id;
end;
$function$;


create or replace function ironclad_private.resolve_competition_leaderboard_season(p_model text,p_date date,p_official boolean)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid; v_authority text:=case when p_model='legacy_three_v1' then 'main' when p_model='four_division_v1' then 'pro' end;
begin
 perform public.leaderboard_require_write_access();
 perform pg_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time',0));
 if v_authority is null then raise exception 'Unknown competition model'; end if;
 if p_model='legacy_three_v1' and exists(select 1 from ironclad_private.legacy_main_pro_season_transition where activated_at is not null) then
   raise exception 'New legacy events cannot enter the continued Pro season' using errcode='55000'; end if;
 select s.id into v_id from public.leaderboard_seasons s where ironclad_private.leaderboard_official_season_role(s.id)=v_authority
   and s.finalized_at is null and (s.is_active or not p_official) order by s.created_at,s.id limit 1 for update;
 if v_id is null and not p_official and p_model='legacy_three_v1' then
   select id into v_id from public.leaderboard_seasons where official_bracket_type='main' order by created_at desc,id desc limit 1;
 end if;
 if v_id is null then
   v_id:=public.get_or_create_leaderboard_season(p_date);
   if not exists(select 1 from public.leaderboard_seasons s where s.id=v_id and ironclad_private.leaderboard_official_season_role(s.id)=v_authority and s.finalized_at is null) then
     raise exception 'Official season authority transition is not complete' using errcode='55000'; end if;
 end if;
 return v_id;
end $$;

create or replace function ironclad_private.guard_leaderboard_membership_authority()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare x ironclad_private.legacy_main_pro_season_transition%rowtype; v_model text; begin
 if tg_op='UPDATE' and exists(select 1 from ironclad_private.legacy_main_pro_season_transition where tournament_id=old.tournament_id)
   and to_jsonb(new) is distinct from to_jsonb(old) then
   raise exception 'Transitional Event 1 membership is immutable' using errcode='55000'; end if;
 select * into x from ironclad_private.legacy_main_pro_season_transition where season_id=new.season_id or tournament_id=new.tournament_id;
 if x.tournament_id=new.tournament_id then
   if tg_op<>'UPDATE' or to_jsonb(new) is distinct from to_jsonb(old) then
     raise exception 'Transitional Event 1 membership is immutable' using errcode='55000'; end if;
   return new;
 end if;
 select division_model_version into v_model from public.tournaments where id=new.tournament_id;
 if new.qualifying_event_number is not null and new.voided_at is null then
   if x.season_id is not null and (x.activated_at is null or new.qualifying_event_number=1 or v_model<>'four_division_v1') then
     raise exception 'Only genuine future Pro events may continue slots 2 through 6' using errcode='23514'; end if;
   if not exists(select 1 from public.leaderboard_seasons s where s.id=new.season_id
     and ironclad_private.leaderboard_official_season_role(s.id)=case when v_model='legacy_three_v1' then 'main' else 'pro' end)
     or not exists(select 1 from public.tournament_brackets b where b.tournament_id=new.tournament_id and b.launched_at is not null
       and b.name=case when v_model='legacy_three_v1' then 'Main' else 'Pro' end) then
     raise exception 'Qualifying event and season authority do not match' using errcode='23514'; end if;
 end if;
 return new;
end $$;
drop trigger leaderboard_membership_authority on public.leaderboard_tournament_season_memberships;
create trigger leaderboard_membership_authority before insert or update on public.leaderboard_tournament_season_memberships
 for each row execute function ironclad_private.guard_leaderboard_membership_authority();

create function ironclad_private.guard_transitional_source_membership_delete()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
 if exists(select 1 from ironclad_private.legacy_main_pro_season_transition where tournament_id=old.tournament_id) then
   raise exception 'Transitional Event 1 cannot be removed by ordinary recovery' using errcode='55000'; end if;
 return old;
end $$;
revoke all on function ironclad_private.guard_transitional_source_membership_delete() from public,anon,authenticated,service_role;
create trigger legacy_pro_membership_delete before delete on public.leaderboard_tournament_season_memberships for each row execute function ironclad_private.guard_transitional_source_membership_delete();

create or replace function ironclad_private.guard_leaderboard_event_model()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_model text; v_expected text; v_authority text; v_tournament_id uuid; v_bracket_id uuid;
 x ironclad_private.legacy_main_pro_season_transition%rowtype; begin
 select * into x from ironclad_private.legacy_main_pro_season_transition where season_id=new.season_id;
 select coalesce(new.tournament_id,r.tournament_id,b.tournament_id),coalesce(new.tournament_bracket_id,r.tournament_bracket_id)
 into v_tournament_id,v_bracket_id
 from (select 1) seed left join public.registrations r on r.id=new.registration_id and r.profile_id=new.player_id
 left join public.tournament_brackets b on b.id=new.tournament_bracket_id;
 if v_tournament_id is null then
   if x.activated_at is not null and new.bracket_type='main' then raise exception 'Historical Main adjustment requires its genuine Event 1 scope' using errcode='23514'; end if;
   return new;
 end if;
 select division_model_version into v_model from public.tournaments where id=v_tournament_id;
 if new.bracket_type='pro' and v_model='four_division_v1' and v_bracket_id is null then
   select r.tournament_bracket_id into v_bracket_id from public.registrations r join public.tournament_brackets b on b.id=r.tournament_bracket_id
   where r.tournament_id=v_tournament_id and r.profile_id=new.player_id and r.registration_status='approved'
     and b.name='Pro' and r.elo_verified_elo>=1700 and r.elo_calculation_version='relic-highest-1v1-v2';
   if v_bracket_id is null then raise exception 'Pro event adjustment requires genuine Pro participant scope' using errcode='23514'; end if;
 end if;
 v_authority:=ironclad_private.leaderboard_official_season_role(new.season_id);
 if v_model is not null and v_authority is distinct from (case when v_model='legacy_three_v1' then 'main' else 'pro' end)
   and not (x.activated_at is not null and x.tournament_id=v_tournament_id and v_model='legacy_three_v1') then
   raise exception 'Point history and season authority do not match' using errcode='23514'; end if;
 if x.tournament_id=v_tournament_id and new.bracket_type in ('pro','main_progression') then
   raise exception 'Legacy Event 1 source families cannot be reclassified' using errcode='23514'; end if;
 if x.activated_at is not null and new.bracket_type='main' and v_tournament_id is distinct from x.tournament_id then
   raise exception 'Only the approved historical Main source may contribute' using errcode='23514'; end if;
 if v_bracket_id is not null then
   select ironclad_private.division_accounting_type(v_model,name) into v_expected from public.tournament_brackets where id=v_bracket_id and tournament_id=v_tournament_id;
   if v_expected is null or (new.bracket_type is distinct from v_expected and not (new.source='admin' and new.bracket_type='overall')) then
     raise exception 'Point accounting type does not match its competition model' using errcode='23514'; end if;
 elsif x.tournament_id=v_tournament_id and new.bracket_type<>'overall' then
   raise exception 'Historical division adjustment requires its factual bracket scope' using errcode='23514';
 end if;
 return new;
end $$;

create function ironclad_private.guard_transitional_source_point_history()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
 if tg_op='UPDATE' and current_setting('ironclad.account_closure',true)='on'
   and (session_user='postgres' or coalesce(auth.role(),'')='service_role')
   and (new.created_by_clerk_user_id is null or new.created_by_clerk_user_id ~ '^deleted:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   and new.created_by_clerk_user_id is distinct from old.created_by_clerk_user_id
   and (to_jsonb(new)-'created_by_clerk_user_id') is not distinct from (to_jsonb(old)-'created_by_clerk_user_id') then
   return new;
 end if;
 if tg_op in ('UPDATE','DELETE') and exists(select 1 from ironclad_private.legacy_main_pro_season_transition where tournament_id=old.tournament_id) then
   if tg_op='DELETE' or to_jsonb(new) is distinct from to_jsonb(old) then
     raise exception 'Transitional source point history is immutable; use separately audited correction authority' using errcode='55000'; end if;
 end if;
 if tg_op='INSERT' and new.source in ('system','recalculation') and exists(select 1 from ironclad_private.legacy_main_pro_season_transition where tournament_id=new.tournament_id) then
   raise exception 'Transitional source point history cannot be recreated' using errcode='55000'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function ironclad_private.guard_transitional_source_point_history() from public,anon,authenticated,service_role;
create trigger legacy_pro_source_points before insert or update or delete on public.leaderboard_point_events
 for each row execute function ironclad_private.guard_transitional_source_point_history();


CREATE OR REPLACE FUNCTION public.finalize_leaderboard_main_season_if_ready(p_season_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_finalized_at timestamptz;
  v_authority text;
  v_event_count integer;
  v_next_season_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ironclad:leaderboard:all-time',0));
  select season.finalized_at,ironclad_private.leaderboard_official_season_role(season.id)
  into v_finalized_at,v_authority
  from public.leaderboard_seasons as season
  where season.id = p_season_id
  for update;

  if not found then
    raise exception 'Leaderboard season not found';
  end if;

  if v_finalized_at is not null then return true; end if;
  if exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=p_season_id and x.activated_at is not null)
    and exists(select 1 from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id
      where m.season_id=p_season_id and m.qualifying_event_number is not null and m.voided_at is null
        and ((m.qualifying_event_number=1 and not exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=m.season_id and x.tournament_id=m.tournament_id))
          or (m.qualifying_event_number>1 and (t.division_model_version<>'four_division_v1' or not exists(select 1 from public.tournament_brackets b where b.tournament_id=t.id and b.name='Pro' and b.launched_at is not null))))) then
    raise exception 'Invalid source in continued Pro season' using errcode='55000'; end if;
  select count(*)::integer
  into v_event_count
  from public.leaderboard_tournament_season_memberships as membership
  where membership.season_id = p_season_id
    and membership.qualifying_event_number is not null
    and membership.voided_at is null;

  if exists(select 1 from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id
    where m.season_id=p_season_id and m.qualifying_event_number is not null and m.voided_at is null
      and (t.status<>'completed' or t.first_completed_at is null)) then return false; end if;
  if v_event_count <> 6 then
    return false;
  end if;

  if exists (
    select 1
    from public.leaderboard_tournament_season_memberships as membership
    where membership.season_id = p_season_id
      and membership.qualifying_event_number is not null
      and membership.voided_at is null
      and membership.scored_at is null
  ) then
    return false;
  end if;

  insert into public.leaderboard_season_champions (
    season_id,
    player_id,
    bracket_type,
    final_rank,
    final_points
  )
  select
    p_season_id,
    season_stats.player_id,
    v_authority,
    season_stats.current_rank,
    season_stats.total_points
  from ironclad_private.leaderboard_official_season_standings as season_stats
  where season_stats.season_id = p_season_id
    and season_stats.bracket_type = v_authority
    and season_stats.current_rank between 1 and 3
  on conflict (season_id, player_id, bracket_type) do nothing;

  if v_finalized_at is null then
    update public.leaderboard_seasons
    set
      finalized_at = clock_timestamp(),
      is_active = false
    where id = p_season_id
      and finalized_at is null;
  end if;

  select public.get_or_create_leaderboard_season(current_date)
  into v_next_season_id;

  update public.leaderboard_seasons
  set is_active = true
  where id = v_next_season_id
    and finalized_at is null
    and not is_active;

  return true;
end;
$function$;


create function ironclad_private.finalize_pro_season_on_event_completion()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_season_id uuid; begin
 select m.season_id into v_season_id from public.leaderboard_tournament_season_memberships m
 where m.tournament_id=new.id and m.qualifying_event_number is not null and m.voided_at is null;
 if v_season_id is not null and ironclad_private.leaderboard_official_season_role(v_season_id)='pro' then
   perform public.finalize_leaderboard_main_season_if_ready(v_season_id); end if;
 return new;
end $$;
revoke all on function ironclad_private.finalize_pro_season_on_event_completion() from public,anon,authenticated,service_role;
create constraint trigger finalize_pro_season_event_completion after update on public.tournaments
 deferrable initially deferred for each row when(new.status='completed' and old.status is distinct from new.status)
 execute function ironclad_private.finalize_pro_season_on_event_completion();

create function ironclad_private.guard_new_legacy_season_after_transition()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
 if new.official_bracket_type='main' and exists(select 1 from ironclad_private.legacy_main_pro_season_transition where activated_at is not null) then
   raise exception 'A new legacy Main successor cannot be created after the one-time continuation' using errcode='55000'; end if;
 return new;
end $$;
revoke all on function ironclad_private.guard_new_legacy_season_after_transition() from public,anon,authenticated,service_role;
create trigger legacy_pro_no_main_successor before insert on public.leaderboard_seasons
 for each row execute function ironclad_private.guard_new_legacy_season_after_transition();

create function ironclad_private.guard_pro_season_champion_snapshot()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
 if ironclad_private.leaderboard_official_season_role(new.season_id)='pro' then
   if new.bracket_type<>'pro' or
    (select count(*) from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id
      where m.season_id=new.season_id and m.qualifying_event_number is not null and m.voided_at is null
        and m.scored_at is not null and t.status='completed' and t.first_completed_at is not null)<>6
    or not exists(select 1 from ironclad_private.leaderboard_official_season_standings s where s.season_id=new.season_id
      and s.player_id=new.player_id and s.bracket_type='pro' and s.current_rank=new.final_rank and s.total_points=new.final_points
      and s.current_rank between 1 and 3) then
     raise exception 'Pro champion snapshot requires six genuine events and exact official standings' using errcode='55000'; end if;
 end if;
 return new;
end $$;
revoke all on function ironclad_private.guard_pro_season_champion_snapshot() from public,anon,authenticated,service_role;
create trigger legacy_pro_champion_authority before insert on public.leaderboard_season_champions
 for each row execute function ironclad_private.guard_pro_season_champion_snapshot();

create function ironclad_private.guard_pro_season_badge_finalization()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
 if new.source_type='season' and exists(select 1 from public.leaderboard_seasons s where s.id=new.source_id and ironclad_private.leaderboard_official_season_role(s.id)='pro')
   and not exists(select 1 from public.leaderboard_seasons s where s.id=new.source_id and s.finalized_at is not null and s.under_review_at is null
     and (select count(*) from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id
       where m.season_id=s.id and m.qualifying_event_number is not null and m.voided_at is null and m.scored_at is not null and t.status='completed')=6) then
   raise exception 'Pro season badge requires valid six-event finalization' using errcode='55000'; end if;
 return new;
end $$;
revoke all on function ironclad_private.guard_pro_season_badge_finalization() from public,anon,authenticated,service_role;
create trigger legacy_pro_season_badge_authority before insert on public.player_badge_awards
 for each row execute function ironclad_private.guard_pro_season_badge_finalization();


CREATE OR REPLACE FUNCTION public.recalculate_leaderboard_for_season(p_season_id uuid, p_triggered_by_clerk_user_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_finalized_at timestamptz;
  v_authority text;
  v_transition boolean;
  v_run_id uuid;
  v_run_status text;
  v_all_time_run_id uuid;
  v_all_time_status text;
  v_all_time_notes text;
begin
  perform public.leaderboard_require_write_access();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ironclad:leaderboard:all-time', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ironclad:leaderboard:season:' || coalesce(p_season_id::text, 'null'),
      0
    )
  );

  select season.finalized_at,season.official_bracket_type
  into v_finalized_at,v_authority
  from public.leaderboard_seasons as season
  where season.id = p_season_id;

  if not found then
    raise exception 'Leaderboard season not found';
  end if;

  select exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=p_season_id) into v_transition;
  if v_finalized_at is not null or v_transition then
    drop table if exists pg_temp.leaderboard_finalized_main_stats;
    create temporary table leaderboard_finalized_main_stats
    on commit drop
    as
    select *
    from public.leaderboard_player_season_stats as season_stats
    where season_stats.season_id = p_season_id
      and (season_stats.bracket_type = v_authority or (v_transition and v_finalized_at is not null and season_stats.bracket_type='pro')); 
  end if;

  v_run_id := public.recalculate_leaderboard_for_season_pr2_core(
    p_season_id,
    p_triggered_by_clerk_user_id
  );

  select run.status
  into v_run_status
  from public.leaderboard_recalculation_runs as run
  where run.id = v_run_id;

  if v_finalized_at is null and not v_transition then
    return v_run_id;
  end if;
  if v_transition and v_finalized_at is null then
    -- Preserve the original cache identity/timestamps only when actual historical facts are unchanged.
    -- A legitimate scoped adjustment is reflected normally rather than silently discarded.
    delete from pg_temp.leaderboard_finalized_main_stats old_stats
    where not exists(select 1 from public.leaderboard_player_season_stats current_stats
      where current_stats.season_id=old_stats.season_id and current_stats.player_id=old_stats.player_id and current_stats.bracket_type=old_stats.bracket_type
        and (to_jsonb(current_stats)-array['id','updated_at','previous_rank','rank_movement'])
          is not distinct from (to_jsonb(old_stats)-array['id','updated_at','previous_rank','rank_movement']));
  end if;

  delete from public.leaderboard_player_season_stats
  where season_id = p_season_id
    and (bracket_type = v_authority or (v_transition and v_finalized_at is not null and bracket_type='pro'))
    and (v_finalized_at is not null or player_id in(select player_id from pg_temp.leaderboard_finalized_main_stats)); 

  insert into public.leaderboard_player_season_stats (
    id,
    season_id,
    player_id,
    bracket_type,
    total_points,
    tournaments_played,
    rounds_passed,
    tournament_wins,
    matches_played,
    matches_won,
    matches_lost,
    win_rate,
    last_tournament_id,
    last_tournament_points,
    current_rank,
    previous_rank,
    rank_movement,
    updated_at
  )
  select
    id,
    season_id,
    player_id,
    bracket_type,
    total_points,
    tournaments_played,
    rounds_passed,
    tournament_wins,
    matches_played,
    matches_won,
    matches_lost,
    win_rate,
    last_tournament_id,
    last_tournament_points,
    current_rank,
    previous_rank,
    rank_movement,
    updated_at
  from pg_temp.leaderboard_finalized_main_stats;

  if v_run_status is distinct from 'completed' then
    return v_run_id;
  end if;

  v_all_time_run_id := public.recalculate_leaderboard_all_time(
    p_triggered_by_clerk_user_id
  );

  select run.status, run.notes
  into v_all_time_status, v_all_time_notes
  from public.leaderboard_recalculation_runs as run
  where run.id = v_all_time_run_id;

  if v_all_time_status is distinct from 'completed' then
    update public.leaderboard_recalculation_runs
    set
      status = 'failed',
      finished_at = now(),
      notes = format(
        'Finalized Main/Pro restoration all-time recalculation failed: %s',
        coalesce(
          nullif(v_all_time_notes, ''),
          v_all_time_status,
          'unknown'
        )
      )
    where id = v_run_id;
  end if;

  return v_run_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.guard_finalized_main_admin_adjustment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if tg_op = 'UPDATE'
    and coalesce(
      current_setting('ironclad.account_closure', true),
      ''
    ) = 'on'
    and (
      session_user = 'postgres'
      or coalesce(auth.role(), '') = 'service_role'
    )
    and new.created_by_clerk_user_id
      is distinct from old.created_by_clerk_user_id
    and new.id is not distinct from old.id
    and new.season_id is not distinct from old.season_id
    and new.tournament_id is not distinct from old.tournament_id
    and new.tournament_bracket_id
      is not distinct from old.tournament_bracket_id
    and new.registration_id is not distinct from old.registration_id
    and new.player_id is not distinct from old.player_id
    and new.bracket_type is not distinct from old.bracket_type
    and new.points is not distinct from old.points
    and new.event_type is not distinct from old.event_type
    and new.description is not distinct from old.description
    and new.source is not distinct from old.source
    and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  if (
    tg_op <> 'INSERT'
    and old.source = 'admin'
    and exists (
      select 1
      from public.leaderboard_seasons as season
      where season.id = old.season_id and (season.official_bracket_type=old.bracket_type or ironclad_private.leaderboard_official_season_role(season.id)=old.bracket_type)
        and season.finalized_at is not null
    )
  ) or (
    tg_op <> 'DELETE'
    and new.source = 'admin'
    and exists (
      select 1
      from public.leaderboard_seasons as season
      where season.id = new.season_id and (season.official_bracket_type=new.bracket_type or ironclad_private.leaderboard_official_season_role(season.id)=new.bracket_type)
        and season.finalized_at is not null
    )
  ) then
    raise exception 'Finalized Main/Pro standings cannot be adjusted'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.save_tournament(p_tournament_id uuid, p_title text, p_slug text, p_description text, p_banner_image_url text, p_registration_open_at timestamp with time zone, p_registration_close_at timestamp with time zone, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_status text, p_format text, p_prize_pool text, p_rules_url text, p_battlefy_url text, p_registration_enabled boolean, p_grand_final_at timestamp with time zone, p_rule_format text, p_result_confirmation_window_minutes integer, p_brackets jsonb, p_division_model_version text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tournament_id uuid;
  v_bracket jsonb;
  v_bracket_name text;
  v_cycle_key text;
  v_conflicting_tournament_title text;
  v_protected_bracket_name text;
  v_rule_format text;
  v_confirmation_window integer;
  v_model text;
begin
  if coalesce(auth.role(),'') <> 'service_role' and session_user <> 'postgres' then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_tournament_id is null then
    v_model := p_division_model_version;
    if v_model is distinct from 'four_division_v1' then
      raise exception 'New tournaments require the four-division model' using errcode='22023';
    end if;
    if exists (select 1 from public.leaderboard_seasons s where s.official_bracket_type='main' and s.finalized_at is null and ironclad_private.leaderboard_official_season_role(s.id)<>'pro') then
      raise exception 'Production season transition requires an approved release decision' using errcode='55000';
    end if;
  else
    select division_model_version into v_model from public.tournaments where id=p_tournament_id for update;
    if not found then raise exception 'Tournament not found'; end if;
    if (p_division_model_version is not null and p_division_model_version is distinct from v_model)
      or (v_model='four_division_v1' and p_division_model_version is null) then
      raise exception 'Tournament model is immutable; reload the editor before saving' using errcode='22023';
    end if;
  end if;
  v_rule_format := coalesce(nullif(p_rule_format, ''), 'format_a');
  v_confirmation_window :=
    coalesce(p_result_confirmation_window_minutes, 30);

  if v_rule_format not in ('format_a', 'format_b') then
    raise exception 'Invalid tournament rule format';
  end if;

  if v_confirmation_window not in (
    1, 5, 15, 30, 60, 120, 360, 720, 1440
  ) then
    raise exception 'Invalid result confirmation window';
  end if;

  if p_registration_open_at is not null
    and p_registration_close_at is not null
    and p_registration_open_at >= p_registration_close_at then
    raise exception 'Registration open date must be before close date';
  end if;

  if p_registration_close_at is not null
    and p_start_date is not null
    and p_registration_close_at > p_start_date then
    raise exception 'Registration must close before the tournament starts';
  end if;

  if p_end_date is not null
    and p_start_date is not null
    and p_end_date < p_start_date then
    raise exception 'Tournament end date must be after the start date';
  end if;

  if p_brackets is null
    or pg_catalog.jsonb_typeof(p_brackets) <> 'array'
    or pg_catalog.jsonb_array_length(p_brackets) = 0 then
    raise exception 'At least one bracket is required';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    where pg_catalog.jsonb_typeof(requested.value) <> 'object'
      or requested.value ->> 'name' is null
      or requested.value ->> 'name' not in ('Academy', 'Challenge', 'Main', 'Pro')
      or (v_model='legacy_three_v1' and requested.value ->> 'name'='Pro')
  ) or (
    select count(*)
    from pg_catalog.jsonb_array_elements(p_brackets)
  ) <> (
    select count(distinct requested.value ->> 'name')
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
  ) then
    raise exception 'Tournament divisions must be unique canonical divisions';
  end if;

  if p_tournament_id is not null then
    select tournament.id
    into v_tournament_id
    from public.tournaments as tournament
    where tournament.id = p_tournament_id
    for update;

    if not found then
      raise exception 'Tournament not found';
    end if;
  end if;

  -- Lock every occupied rating band in one global order. The historical
  -- top tier overlaps both future upper divisions; those future divisions
  -- remain independent of one another.
  for v_cycle_key in
    select distinct cycle.key
    from pg_catalog.jsonb_array_elements(p_brackets) requested(value)
    cross join lateral unnest(ironclad_private.division_cycle_keys(v_model,requested.value->>'name')) cycle(key)
    order by cycle.key
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ironclad:ranked-division-cycle:'||v_cycle_key,0));
  end loop;
  for v_bracket_name in
    select requested.value ->> 'name'
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    order by requested.value ->> 'name'
  loop
    select tournament.title
    into v_conflicting_tournament_title
    from public.tournament_brackets as bracket
    join public.tournaments as tournament
      on tournament.id = bracket.tournament_id
    where ironclad_private.division_cycle_keys(tournament.division_model_version,bracket.name)
      && ironclad_private.division_cycle_keys(v_model,v_bracket_name)
      and (
        p_tournament_id is null
        or tournament.id <> p_tournament_id
      )
      and coalesce(tournament.status, '') not in (
        'completed', 'cancelled', 'voided'
      )
      and not exists (
        select 1
        from public.tournament_division_not_held_closures as closure
        where closure.tournament_bracket_id = bracket.id
      )
      and (
        bracket.launched_at is null
        or not exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
        )
        or exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
            and public.is_generated_bracket_complete(generated.id)
              is distinct from true
        )
      )
    order by tournament.created_at, tournament.id
    limit 1;

    if v_conflicting_tournament_title is not null then
      raise exception
        'The % Division already has an unresolved ranked cycle in event %. Resolve that Division before enabling another.',
        v_bracket_name,
        v_conflicting_tournament_title
        using errcode = '55000';
    end if;
  end loop;

  if p_tournament_id is not null then
    select bracket.name
    into v_protected_bracket_name
    from public.tournament_brackets as bracket
    where bracket.tournament_id = p_tournament_id
      and bracket.name not in (
        select requested.value ->> 'name'
        from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
      )
      and (
        exists (
          select 1
          from public.tournament_division_not_held_closures as closure
          where closure.tournament_bracket_id = bracket.id
        )
        or exists (
          select 1
          from public.registrations as registration
          where registration.tournament_bracket_id = bracket.id
            and registration.registration_status = 'approved'
        )
        or exists (
          select 1
          from public.generated_brackets as generated
          where generated.tournament_bracket_id = bracket.id
        )
      )
    order by bracket.name
    limit 1;

    if v_protected_bracket_name is not null then
      raise exception
        'Cannot remove the % bracket during a normal tournament edit because it has protected registration or competition history.',
        v_protected_bracket_name;
    end if;
  end if;

  if p_tournament_id is null then
    insert into public.tournaments (
      title, slug, description, banner_image_url,
      registration_open_at, registration_close_at,
      start_date, end_date, status, format, prize_pool,
      rules_url, battlefy_url, registration_enabled,
      grand_final_at, rule_format,
      result_confirmation_window_minutes, division_model_version
    )
    values (
      p_title, p_slug, p_description, p_banner_image_url,
      p_registration_open_at, p_registration_close_at,
      p_start_date, p_end_date, p_status, p_format,
      coalesce(p_prize_pool, ''), nullif(p_rules_url, ''),
      nullif(p_battlefy_url, ''), p_registration_enabled, null,
      v_rule_format, v_confirmation_window, v_model
    )
    returning id into v_tournament_id;
  else
    update public.tournaments
    set
      title = p_title,
      slug = p_slug,
      description = p_description,
      banner_image_url = p_banner_image_url,
      registration_open_at = p_registration_open_at,
      registration_close_at = p_registration_close_at,
      start_date = coalesce(p_start_date, start_date),
      end_date = coalesce(p_end_date, end_date),
      status = p_status,
      format = p_format,
      prize_pool = coalesce(p_prize_pool, ''),
      rules_url = nullif(p_rules_url, ''),
      battlefy_url = nullif(p_battlefy_url, ''),
      registration_enabled = p_registration_enabled,
      rule_format = v_rule_format,
      result_confirmation_window_minutes = v_confirmation_window
    where id = p_tournament_id
    returning id into v_tournament_id;
  end if;

  for v_bracket in
    select requested.value
    from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
  loop
    insert into public.tournament_brackets (
      tournament_id, name, elo_rules, max_players
    )
    values (
      v_tournament_id,
      v_bracket ->> 'name',
      v_bracket ->> 'elo_rules',
      (v_bracket ->> 'max_players')::integer
    )
    on conflict (tournament_id, name)
    do update set
      elo_rules = excluded.elo_rules,
      max_players = excluded.max_players;
  end loop;

  delete from public.tournament_brackets
  where tournament_id = v_tournament_id
    and name not in (
      select requested.value ->> 'name'
      from pg_catalog.jsonb_array_elements(p_brackets) as requested(value)
    );

  -- Re-run the existing lifecycle derivation now that the Division rows exist.
  -- Assigning status to itself deliberately invokes the existing trigger; it
  -- does not introduce another registration-enabled writer.
  update public.tournaments as tournament
  set status = tournament.status
  where tournament.id = v_tournament_id;

  return v_tournament_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.get_player_badge_season_authority_participants(p_season_id uuid)
 RETURNS TABLE(player_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with season_scope as (
    select season.id,ironclad_private.leaderboard_official_season_role(season.id) as official_bracket_type
    from public.leaderboard_seasons as season
    where season.id = p_season_id
      and season.finalized_at is not null
      and season.under_review_at is null
  ),
  participation_candidates as (
    select distinct event.player_id
    from public.leaderboard_point_events as event
    join season_scope as season
      on season.id = event.season_id
    join public.leaderboard_division_settlements as settlement
      on settlement.season_id = event.season_id
      and settlement.tournament_bracket_id = event.tournament_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = settlement.tournament_bracket_id
      and bracket.tournament_id = event.tournament_id
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.season_id = event.season_id
          and withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
  ),
  podium_candidates as (
    select season_stats.player_id
    from ironclad_private.leaderboard_official_season_standings as season_stats
    join season_scope as season
      on season.id = season_stats.season_id
    where season_stats.bracket_type = season.official_bracket_type
      and season_stats.current_rank <= 3
  ),
  champion_candidates as (
    select champion.player_id
    from public.leaderboard_season_champions as champion
    join season_scope as season
      on season.id = champion.season_id
    where champion.bracket_type = season.official_bracket_type
      and champion.final_rank = 1
  )
  select distinct candidate.player_id
  from (
    select participation.player_id from participation_candidates as participation
    union all
    select podium.player_id from podium_candidates as podium
    union all
    select champion.player_id from champion_candidates as champion
  ) as candidate
  where candidate.player_id is not null;
$function$;


CREATE OR REPLACE FUNCTION public.get_player_badge_season_summary(p_player_id uuid)
 RETURNS TABLE(season_campaigner_count integer, first_season_campaigner_season_id uuid, first_season_campaigner_at timestamp with time zone, first_season_campaigner_threshold_tournament_id uuid, first_season_campaigner_tournament_count integer, podium_finish_count integer, first_podium_season_id uuid, first_podium_at timestamp with time zone, first_podium_rank integer, champion_finish_count integer, first_champion_season_id uuid, first_champion_at timestamp with time zone, first_champion_rank integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  with finalized_seasons as (
    select season.id, season.finalized_at,ironclad_private.leaderboard_official_season_role(season.id) as official_bracket_type
    from public.leaderboard_seasons as season
    where season.finalized_at is not null
      and season.under_review_at is null
  ),
  qualifying_participation as (
    select
      event.season_id,
      event.tournament_id,
      min(settlement.settled_at) as completed_at
    from public.leaderboard_point_events as event
    join finalized_seasons as season
      on season.id = event.season_id
    join public.leaderboard_division_settlements as settlement
      on settlement.season_id = event.season_id
      and settlement.tournament_bracket_id = event.tournament_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = settlement.tournament_bracket_id
      and bracket.tournament_id = event.tournament_id
    join public.tournaments as tournament
      on tournament.id = event.tournament_id
      and tournament.status not in ('cancelled', 'voided')
    where event.player_id = p_player_id
      and (season.official_bracket_type='main' or (
        exists(select 1 from public.leaderboard_tournament_season_memberships m where m.season_id=event.season_id and m.tournament_id=event.tournament_id
          and m.qualifying_event_number is not null and m.scored_at is not null and m.voided_at is null)
        and (event.bracket_type='pro' or (event.bracket_type='main' and exists(select 1 from ironclad_private.legacy_main_pro_season_transition x
          where x.season_id=event.season_id and x.tournament_id=event.tournament_id and x.tournament_bracket_id=event.tournament_bracket_id and x.activated_at is not null)))
      ))
      and event.event_type = 'participation'
      and event.source in ('system', 'recalculation')
      and event.registration_id is not null
      and event.tournament_bracket_id is not null
      and not exists (
        select 1
        from public.leaderboard_point_events as withheld
        where withheld.season_id = event.season_id
          and withheld.tournament_id = event.tournament_id
          and withheld.registration_id = event.registration_id
          and withheld.player_id = event.player_id
          and withheld.event_type = 'participation_withheld'
          and withheld.source = event.source
      )
    group by event.season_id, event.tournament_id
  ),
  ranked_participation as (
    select
      participation.*,
      row_number() over (
        partition by participation.season_id
        order by participation.completed_at, participation.tournament_id
      ) as tournament_number,
      count(*) over (
        partition by participation.season_id
      )::integer as season_tournament_count
    from qualifying_participation as participation
  ),
  season_campaigners as (
    select
      ranked.season_id,
      ranked.tournament_id as threshold_tournament_id,
      ranked.completed_at as threshold_completed_at,
      ranked.season_tournament_count
    from ranked_participation as ranked
    where ranked.tournament_number = 4
  ),
  ranked_campaigners as (
    select
      campaigner.*,
      row_number() over (
        order by campaigner.threshold_completed_at, campaigner.season_id
      ) as campaigner_number
    from season_campaigners as campaigner
  ),
  podium_finishes as (
    select
      season_stats.season_id,
      season.finalized_at,
      season_stats.current_rank
    from ironclad_private.leaderboard_official_season_standings as season_stats
    join finalized_seasons as season
      on season.id = season_stats.season_id
    where season_stats.player_id = p_player_id
      and season_stats.bracket_type = season.official_bracket_type
      and season_stats.current_rank <= 3
  ),
  ranked_podiums as (
    select
      podium.*,
      row_number() over (
        order by podium.finalized_at, podium.season_id
      ) as podium_number
    from podium_finishes as podium
  ),
  champion_finishes as (
    select
      champion.season_id,
      season.finalized_at,
      champion.final_rank
    from public.leaderboard_season_champions as champion
    join finalized_seasons as season
      on season.id = champion.season_id
    where champion.player_id = p_player_id
      and champion.bracket_type = season.official_bracket_type
      and champion.final_rank = 1
  ),
  ranked_champions as (
    select
      champion.*,
      row_number() over (
        order by champion.finalized_at, champion.season_id
      ) as champion_number
    from champion_finishes as champion
  )
  select
    coalesce((select count(*)::integer from ranked_campaigners), 0),
    (select campaigner.season_id from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1),
    (select campaigner.threshold_completed_at
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1),
    (select campaigner.threshold_tournament_id
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1),
    (select campaigner.season_tournament_count
      from ranked_campaigners as campaigner
      where campaigner.campaigner_number = 1),
    coalesce((select count(*)::integer from ranked_podiums), 0),
    (select podium.season_id from ranked_podiums as podium
      where podium.podium_number = 1),
    (select podium.finalized_at from ranked_podiums as podium
      where podium.podium_number = 1),
    (select podium.current_rank from ranked_podiums as podium
      where podium.podium_number = 1),
    coalesce((select count(*)::integer from ranked_champions), 0),
    (select champion.season_id from ranked_champions as champion
      where champion.champion_number = 1),
    (select champion.finalized_at from ranked_champions as champion
      where champion.champion_number = 1),
    (select champion.final_rank from ranked_champions as champion
      where champion.champion_number = 1);
$function$;


create or replace view public.leaderboard_current_season with(security_barrier=true,security_invoker=false) as
select s.id,case when x.activated_at is not null then s.year::text||' Pro Season '||s.season_number::text else s.name end as name,s.year,s.season_number,s.start_date,s.end_date,s.is_active,s.created_at,s.updated_at,
 (select count(*)::integer from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id where m.season_id=s.id and m.qualifying_event_number is not null and m.scored_at is not null and m.voided_at is null and t.status='completed' and t.first_completed_at is not null) valid_main_event_count,
 s.finalized_at is not null is_finalized,s.under_review_at is not null is_under_review,
 case when x.activated_at is not null then 'pro'::text else s.official_bracket_type end official_bracket_type,
 (select count(*)::integer from public.leaderboard_tournament_season_memberships m join public.tournaments t on t.id=m.tournament_id where m.season_id=s.id and m.qualifying_event_number is not null and m.scored_at is not null and m.voided_at is null and t.status='completed' and t.first_completed_at is not null) valid_qualifying_event_count,
 x.activated_at is not null has_legacy_main_transition
from public.leaderboard_seasons s left join ironclad_private.legacy_main_pro_season_transition x on x.season_id=s.id
order by case when s.finalized_at is null then 0 else 1 end,case when s.finalized_at is null then s.created_at else null::timestamptz end,s.finalized_at desc nulls last,s.created_at desc limit 1;


create or replace view public.leaderboard_public_season_standings with(security_barrier=true,security_invoker=false) as
SELECT season_stats.season_id,
    case when season_stats.bracket_type='pro' and exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=season.id and x.activated_at is not null) then season.year::text||' Pro Season '||season.season_number::text else season.name end AS season_name,
    season.year,
    season.season_number,
    season.start_date,
    season.end_date,
        CASE
            WHEN player.account_closed_at IS NULL AND player.public_profile_enabled THEN season_stats.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            WHEN player.public_profile_enabled THEN player.display_name
            ELSE player.in_game_name
        END AS display_name,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            ELSE player.in_game_name
        END AS in_game_name,
        CASE
            WHEN player.account_closed_at IS NULL AND player.public_profile_enabled THEN player.country
            ELSE NULL::text
        END AS country,
        CASE
            WHEN player.account_closed_at IS NULL AND player.public_profile_enabled THEN player.region
            ELSE NULL::text
        END AS region,
        CASE
            WHEN player.account_closed_at IS NULL AND player.public_profile_enabled THEN player.current_elo
            ELSE NULL::integer
        END AS current_elo,
    player.account_closed_at IS NULL AND player.public_profile_enabled AND player.avatar_url IS NOT NULL AS has_avatar,
    NULL::text AS avatar_url,
    season_stats.bracket_type,
    season_stats.total_points,
    season_stats.tournaments_played,
    season_stats.rounds_passed,
    season_stats.tournament_wins,
    season_stats.matches_played,
    season_stats.matches_won,
    season_stats.matches_lost,
    season_stats.win_rate,
        CASE
            WHEN player.account_closed_at IS NULL THEN season_stats.last_tournament_id
            ELSE NULL::uuid
        END AS last_tournament_id,
    last_tournament.title AS last_tournament_title,
    season_stats.last_tournament_points,
    season_stats.current_rank,
    season_stats.previous_rank,
    season_stats.rank_movement,
    season_stats.updated_at,
    row_number() OVER (PARTITION BY season_stats.season_id, season_stats.bracket_type ORDER BY season_stats.player_id) AS display_order,
 case when season_stats.bracket_type='pro' and exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=season_stats.season_id and x.tournament_id=season_stats.last_tournament_id and x.activated_at is not null) then 'main'::text else season_stats.bracket_type end as last_tournament_bracket_type
   FROM (
 select s.season_id,s.player_id,s.bracket_type,s.total_points,s.tournaments_played,s.rounds_passed,s.tournament_wins,s.matches_played,s.matches_won,s.matches_lost,s.win_rate,s.last_tournament_id,s.last_tournament_points,s.current_rank,s.previous_rank,s.rank_movement,s.updated_at
 from public.leaderboard_player_season_stats s where s.bracket_type<>'pro' or not exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=s.season_id and x.activated_at is not null)
 union all
 select official.* from ironclad_private.leaderboard_official_season_standings official join ironclad_private.legacy_main_pro_season_transition x on x.season_id=official.season_id and x.activated_at is not null
) season_stats
     JOIN public.leaderboard_seasons season ON season.id = season_stats.season_id
     JOIN public.players player ON player.id = season_stats.player_id
     LEFT JOIN public.tournaments last_tournament ON last_tournament.id = season_stats.last_tournament_id;

create or replace view public.leaderboard_public_season_champions with(security_barrier=true,security_invoker=false) as
SELECT
        CASE
            WHEN player.account_closed_at IS NULL AND player.public_profile_enabled THEN champion.id::text
            ELSE 'private-champion:'::text || md5(champion.id::text)
        END AS id,
    champion.season_id,
    case when champion.bracket_type='pro' and exists(select 1 from ironclad_private.legacy_main_pro_season_transition x where x.season_id=season.id and x.activated_at is not null) then season.year::text||' Pro Season '||season.season_number::text else season.name end AS season_name,
    champion.bracket_type,
        CASE
            WHEN player.account_closed_at IS NULL AND player.public_profile_enabled THEN champion.player_id
            ELSE NULL::uuid
        END AS player_id,
        CASE
            WHEN player.account_closed_at IS NOT NULL THEN 'Former Competitor'::text
            ELSE player.in_game_name
        END AS player_name,
        CASE
            WHEN player.account_closed_at IS NULL AND player.public_profile_enabled THEN player.country
            ELSE NULL::text
        END AS country,
    player.account_closed_at IS NULL AND player.public_profile_enabled AND player.avatar_url IS NOT NULL AS has_avatar,
    champion.final_rank,
    champion.final_points,
    champion.created_at
   FROM public.leaderboard_season_champions champion
     JOIN public.leaderboard_seasons season ON season.id = champion.season_id
     JOIN public.players player ON player.id = champion.player_id;

-- Existing function/view owners and ACLs are retained by CREATE OR REPLACE.
-- No public execution or direct private mapping access is added.
commit;
