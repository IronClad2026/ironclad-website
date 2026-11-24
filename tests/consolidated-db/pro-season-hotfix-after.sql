-- First prove the migration exposed already-existing points before any fixture retry.
select pg_temp.fd_assert(
  (select evidence=pg_temp.pro_hotfix_evidence() from pro_hotfix_before),
  'migration changed recorded points, receipts, memberships, results, acceptances, season snapshots or recalculation runs');

select pg_temp.fd_assert(
  (select valid_qualifying_event_count=2 and not is_finalized from public.leaderboard_current_season)
  and (select count(*)=10 from public.leaderboard_public_season_standings where bracket_type='pro')
  and not exists (
    select 1 from pro_hotfix_expected e
    left join public.leaderboard_public_season_standings s on s.in_game_name=e.player_name and s.bracket_type='pro'
    where (s.total_points,s.current_rank) is distinct from (e.expected_points,e.expected_rank)
  ),
  'exact projected ten-player points, competitive ties and 2/6 count must match the audited scenario');
select pg_temp.fd_assert(
  (select rounds_passed=3 and tournaments_played=1 and tournament_wins=0
     and matches_played=4 and matches_won=3 and matches_lost=1
   from public.leaderboard_public_season_standings where in_game_name='Nub' and bracket_type='pro')
  and (select rounds_passed=1 from public.leaderboard_public_season_standings where in_game_name='JRaptor' and bracket_type='pro')
  and (select count(*)=2 and sum(points)=5 and count(*) filter(where event_type='participation_withheld')=1
    from public.leaderboard_point_events where tournament_id=pg_temp.fd_id('event',1)
    and player_id=pg_temp.fd_id('Main-player',0,7)),
  'preserve the no-show and genuine series distinction, including Nub’s rounds-passed tiebreak over JRaptor');
select pg_temp.fd_assert(
  (select count(*)=2 and bool_and(top_scorer_name='Reakly' and top_scorer_points=25
      and ((qualifying_event_number=1 and bracket_type='main' and tournament_id=pg_temp.fd_id('event',1) and tournament_title='THE NEW FRONT')
        or (qualifying_event_number=2 and bracket_type='pro' and tournament_id=pg_temp.fd_id('event',2) and tournament_title='HOLD THE LINE')))
   from public.leaderboard_public_season_event_impacts where season_id=(select season_id from pro_hotfix_source)),
  'both event impacts retain full historical and Pro totals even when their winner’s latest event has changed');
select pg_temp.fd_assert(
  (select count(*)=8 and sum(total_points)=115 from public.leaderboard_public_all_time_standings where bracket_type='main_progression')
  and not exists(select 1 from public.leaderboard_season_champions where season_id=(select season_id from pro_hotfix_source)),
  'independent Main completion updates Main Career and never creates official season points or an early champion');

-- Mutate only synthetic inputs under savepoints. The settled ledger stays in place
-- in each negative case, so a view based on points alone would fail these checks.
savepoint unscored;
update public.leaderboard_tournament_season_memberships set scored_at=null where tournament_id=pg_temp.fd_id('event',2);
select pg_temp.fd_assert((select valid_qualifying_event_count=1 from public.leaderboard_current_season),'unscored Pro membership cannot qualify');
rollback to unscored;

savepoint voided;
update public.leaderboard_tournament_season_memberships
set voided_at=clock_timestamp(),voided_by_clerk_user_id='local-consolidated-admin',void_reason='Synthetic exclusion proof'
where tournament_id=pg_temp.fd_id('event',2);
select pg_temp.fd_assert((select valid_qualifying_event_count=1 from public.leaderboard_current_season),'voided Pro membership cannot qualify');
rollback to voided;

savepoint receipt;
delete from public.leaderboard_division_settlements where tournament_bracket_id=pg_temp.fd_id('Pro',2);
select pg_temp.fd_assert((select valid_qualifying_event_count=1 from public.leaderboard_current_season),'another receipt in the same event and season cannot stand in for the Pro receipt');
rollback to receipt;

savepoint incomplete;
set local session_replication_role='replica';
update public.tournament_matches set status='in_progress',winner_registration_id=null,
  player_one_score=null,player_two_score=null where id=pg_temp.fd_id('Pro-match-3',2,1);
set local session_replication_role='origin';
select pg_temp.fd_assert((select valid_qualifying_event_count=1 from public.leaderboard_current_season),'incomplete Pro bracket with a stale receipt cannot qualify');
rollback to incomplete;

-- Exercise the same database RPCs the application uses for replay-backed final
-- reports. Storage bytes and signed upload URLs are outside this local contract.
create function pg_temp.pro_hotfix_report_final(p_event integer,p_division text) returns void
language plpgsql as $$
declare
  v_match public.tournament_matches%rowtype;
  v_submitter text;
  v_opponent text;
  v_attempt uuid;
  v_claim uuid;
  v_report uuid;
  v_winners uuid[];
  v_hashes text[];
  v_deadline timestamptz;
begin
  select * into strict v_match from public.tournament_matches where id=pg_temp.fd_id(p_division||'-match-3',p_event,1);
  select clerk_user_id into strict v_submitter from public.registrations where id=v_match.player_one_registration_id;
  select clerk_user_id into strict v_opponent from public.registrations where id=v_match.player_two_registration_id;
  v_winners:=array[v_match.player_one_registration_id,v_match.player_two_registration_id,
    v_match.player_one_registration_id,v_match.player_one_registration_id];
  select array_agg(encode(sha256(convert_to(v_match.id::text||':'||g.ordinality,'UTF8')),'hex') order by g.ordinality)
    into v_hashes from unnest(v_winners) with ordinality g;
  perform pg_temp.fd_assert(v_match.status='in_progress' and v_match.deadline_at>clock_timestamp(),p_division||' final must be ready to report');
  v_attempt:=(public.prepare_match_replay_upload_attempt(v_match.id,v_submitter,v_match.player_one_registration_id,
    3,1,array[32,32,32,32],v_winners)->>'attempt_id')::uuid;
  v_claim:=(public.claim_match_replay_attempt_finalization(v_attempt,v_match.id,v_submitter,
    v_match.player_one_registration_id,3,1)->>'claim_id')::uuid;
  v_report:=(public.commit_match_replay_attempt_result(v_attempt,v_claim,v_match.id,v_submitter,
    v_hashes,'Synthetic final report')->>'report_group_id')::uuid;
  select confirmation_deadline_at into strict v_deadline from public.match_result_report_groups
    where id=v_report and status='pending_confirmation' and finalized_at is null;
  perform pg_temp.fd_assert(v_deadline>clock_timestamp()
    and (select status='pending_review' and deadline_at is not distinct from v_match.deadline_at
         from public.tournament_matches where id=v_match.id),p_division||' final report must preserve the match deadline and await confirmation');
  perform public.confirm_match_result_report_group_api(v_report,v_opponent);
  perform pg_temp.fd_assert(
    (select status='completed' and winner_registration_id=v_match.player_one_registration_id
            and player_one_score=3 and player_two_score=1 from public.tournament_matches where id=v_match.id)
    and (select status='confirmed' and finalized_at is not null and confirmation_deadline_at=v_deadline
         from public.match_result_report_groups where id=v_report)
    and (select status='committed' and committed_report_group_id=v_report from public.match_replay_upload_attempts where id=v_attempt)
    and (select count(*)=4 and count(distinct replay_content_hash)=4
         from public.match_result_submissions where report_group_id=v_report),
    p_division||' confirmation must preserve four unique replay proofs and complete the official final');
end $$;

create function pg_temp.pro_hotfix_retry(p_bracket uuid) returns void language plpgsql as $$
declare outcome jsonb;
begin
  outcome:=public.settle_leaderboard_division(p_bracket,null);
  perform pg_temp.fd_assert(not (outcome->>'settlementCreated')::boolean
    and not (outcome->>'pointEventsChanged')::boolean and not (outcome->>'lateEntryBonusesChanged')::boolean,
    'repeated settlement changed existing scoring evidence');
end $$;

select pg_temp.pro_hotfix_retry(pg_temp.fd_id('Pro',2));
set constraints all deferred;
select pg_temp.pro_hotfix_report_final(2,'Academy');
select pg_temp.pro_hotfix_report_final(2,'Challenge');
set constraints all immediate;
select pg_temp.pro_hotfix_retry(pg_temp.fd_id('Pro',2));
select pg_temp.fd_assert(
  (select status='completed' and first_completed_at is not null from public.tournaments where id=pg_temp.fd_id('event',2))
  and (select valid_qualifying_event_count=2 from public.leaderboard_current_season)
  and (select count(*)=2 from public.leaderboard_public_season_event_impacts where season_id=(select season_id from pro_hotfix_source))
  and (select count(*)=4 from public.leaderboard_division_settlements s join public.tournament_brackets b on b.id=s.tournament_bracket_id
       where b.tournament_id=pg_temp.fd_id('event',2)),
  'later sibling finals finish the parent normally without another Pro slot, impact or receipt');

do $$ declare event integer; begin
  for event in 3..5 loop
    perform pg_temp.fd_create(event,'Pro',event);
    perform pg_temp.fd_play(event,'Pro');
  end loop;
end $$;
select pg_temp.fd_assert((select valid_qualifying_event_count=5 and not is_finalized from public.leaderboard_current_season),'five qualifying events do not close the season');

select pg_temp.fd_create(6,'Academy',6);
select pg_temp.fd_create(6,'Challenge',6);
select pg_temp.fd_create(6,'Pro',6);
select pg_temp.fd_play(6,'Pro');
select pg_temp.fd_assert(
  (select status='in_progress' and first_completed_at is null from public.tournaments where id=pg_temp.fd_id('event',6))
  and (select finalized_at is not null and not is_active from public.leaderboard_seasons where id=(select season_id from pro_hotfix_source))
  and (select count(*)=6 from public.leaderboard_public_season_event_impacts where season_id=(select season_id from pro_hotfix_source))
  and (select count(*)=1 from public.leaderboard_seasons where official_bracket_type='pro' and finalized_at is null and is_active)
  and (select count(*)>0 and bool_and(bracket_type='pro') from public.leaderboard_season_champions where season_id=(select season_id from pro_hotfix_source)),
  'sixth genuine Pro completes and snapshots its season while Academy and Challenge remain active');

-- The application award writer uses the unique player/badge key. Exercise the
-- guard against real champion rows while the parent is still in progress.
create function pg_temp.pro_hotfix_champion_awards() returns void language sql as $$
  insert into public.player_badge_awards(player_id,badge_slug,source_type,source_id)
  select player_id,'season-champion','season',season_id from public.leaderboard_season_champions
  where season_id=(select season_id from pro_hotfix_source) and final_rank=1
  on conflict (player_id,badge_slug) do nothing;
$$;
select pg_temp.pro_hotfix_champion_awards();
select pg_temp.fd_assert(exists(select 1 from public.player_badge_awards where source_type='season'
  and source_id=(select season_id from pro_hotfix_source)),'settled six-event season may create an award before parent completion');

create temp table pro_hotfix_final as
select (select jsonb_agg(to_jsonb(s) order by s.id) from public.leaderboard_seasons s) seasons,
  (select jsonb_agg(to_jsonb(c) order by c.id) from public.leaderboard_season_champions c) champions,
  (select jsonb_agg(to_jsonb(a) order by a.id) from public.player_badge_awards a where source_type='season') awards;
select pg_temp.pro_hotfix_retry(pg_temp.fd_id('Pro',6));
select pg_temp.fd_play(6,'Academy',6);
select pg_temp.fd_play(6,'Challenge',6);
set constraints all deferred;
select pg_temp.pro_hotfix_report_final(6,'Academy');
select pg_temp.pro_hotfix_report_final(6,'Challenge');
set constraints all immediate;
select pg_temp.pro_hotfix_retry(pg_temp.fd_id('Pro',6));
select pg_temp.pro_hotfix_champion_awards();
select pg_temp.fd_assert(
  (select status='completed' and first_completed_at is not null from public.tournaments where id=pg_temp.fd_id('event',6))
  and seasons=(select jsonb_agg(to_jsonb(s) order by s.id) from public.leaderboard_seasons s)
  and champions=(select jsonb_agg(to_jsonb(c) order by c.id) from public.leaderboard_season_champions c)
  and awards is not distinct from (select jsonb_agg(to_jsonb(a) order by a.id) from public.player_badge_awards a where source_type='season'),
  'later parent completion and settlement retries preserve finalized season, champion and award identities')
from pro_hotfix_final;
