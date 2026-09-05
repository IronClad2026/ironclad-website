-- Run after unlaunched-event-void-concurrency-setup.sql in a fresh local clone.
-- Every scenario rolls back; production authorities and triggers stay enabled.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() !~ '^ironclad_void_[a-zA-Z0-9_]+$'
    or inet_server_addr() is distinct from '127.0.0.1'::inet
    or inet_server_port() is distinct from 55462 then
    raise exception 'Disposable loopback launch regression database required';
  end if;
end $$;
create function pg_temp.launch_assert(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Launch regression: %', message; end if;
end $$;

-- Single Division: one launch, stable retry, one activation per first-round Match.
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"isolated-launch-repair-admin"}';
set session authorization service_role;
do $$ declare r record; begin
  if current_user <> 'service_role' or session_user <> 'service_role' then
    raise exception 'Canonical service-role session required';
  end if;
  select * into r from public.launch_tournament_division('e2200000-0000-4000-8000-000000000003', 'isolated-launch-repair-admin');
  if r.launched_at is null or r.already_launched then raise exception 'First launch was not new'; end if;
end $$;
reset session authorization;
create temporary table launch_first_snapshot as
select (select launched_at from public.tournament_brackets where id='e2200000-0000-4000-8000-000000000003') as launched_at,
       (select count(*) from public.notifications) as notification_count;
set session authorization service_role;
do $$ declare r record; begin
  select * into r from public.launch_tournament_division('e2200000-0000-4000-8000-000000000003', 'isolated-launch-repair-admin');
  if r.already_launched is distinct from true then raise exception 'Launch retry was not idempotent'; end if;
end $$;
reset session authorization;
select pg_temp.launch_assert((select status='in_progress' and not registration_enabled from public.tournaments where id='e2100000-0000-4000-8000-000000000003'), 'single Division parent state');
select pg_temp.launch_assert((select launched_at=(select launched_at from launch_first_snapshot) from public.tournament_brackets where id='e2200000-0000-4000-8000-000000000003'), 'retry changed launch timestamp');
select pg_temp.launch_assert((select count(*)=(select notification_count from launch_first_snapshot) from public.notifications), 'retry duplicated notifications');
select pg_temp.launch_assert((select competition_locked_at=(select launched_at from launch_first_snapshot) from public.generated_brackets where tournament_bracket_id='e2200000-0000-4000-8000-000000000003'), 'roster lock timestamp');
select pg_temp.launch_assert((select count(*)=4 and bool_and(m.activation_version=1) from public.tournament_matches m join public.generated_brackets g on g.id=m.generated_bracket_id where g.tournament_bracket_id='e2200000-0000-4000-8000-000000000003' and m.activated_at is not null), 'first-round activation was not exactly once');
do $$ begin
  begin
    update public.registrations set registration_status='pending' where tournament_bracket_id='e2200000-0000-4000-8000-000000000003';
    raise exception 'Locked roster unexpectedly changed';
  exception when raise_exception then
    if sqlerrm <> 'Registration changes are blocked because this division has launched' then raise; end if;
  end;
  begin
    update public.tournaments set status='registration_open' where id='e2100000-0000-4000-8000-000000000003';
    raise exception 'Lifecycle guard unexpectedly allowed reopening';
  exception when raise_exception then
    if sqlerrm <> 'A tournament with a launched division cannot be reopened' then raise; end if;
  end;
end $$;
rollback;

-- A non-ready sibling does not block the ready Division or close its registrations.
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"isolated-launch-repair-admin"}';
insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players) values ('e2200000-0000-4000-8000-000000000007','e2100000-0000-4000-8000-000000000003','Main','1400-1799',8);
set session authorization service_role;
do $$ begin
  perform public.launch_tournament_division('e2200000-0000-4000-8000-000000000003', 'isolated-launch-repair-admin');
  begin
    perform public.launch_tournament_division('e2200000-0000-4000-8000-000000000007', 'isolated-launch-repair-admin');
    raise exception 'Unready sibling unexpectedly launched';
  exception when raise_exception then
    if sqlerrm not like 'Division launch requires exactly % approved players and no unresolved vacancy' then raise; end if;
  end;
end $$;
reset session authorization;
select pg_temp.launch_assert((select status='in_progress' and registration_enabled from public.tournaments where id='e2100000-0000-4000-8000-000000000003'), 'mixed Event registration must remain enabled');
select pg_temp.launch_assert((select launched_at is null from public.tournament_brackets where id='e2200000-0000-4000-8000-000000000007'), 'unready sibling changed');
set session authorization service_role;
do $$ begin
  perform public.close_tournament_division_without_launch('e2200000-0000-4000-8000-000000000007','minimum_roster_not_reached',null,'isolated-launch-repair-admin');
end $$;
reset session authorization;
select pg_temp.launch_assert((select not registration_enabled from public.tournaments where id='e2100000-0000-4000-8000-000000000003'), 'Not Held sibling must close final registration availability');
select pg_temp.launch_assert((select count(*)=1 from public.tournament_division_not_held_closures where tournament_bracket_id='e2200000-0000-4000-8000-000000000007'), 'Not Held receipt');
rollback;

-- An already Not Held sibling must not prevent the final open Division launching.
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"isolated-launch-repair-admin"}';
insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players) values ('e2200000-0000-4000-8000-000000000007','e2100000-0000-4000-8000-000000000003','Main','1400-1799',8);
set session authorization service_role;
do $$ begin
  perform public.close_tournament_division_without_launch('e2200000-0000-4000-8000-000000000007','minimum_roster_not_reached',null,'isolated-launch-repair-admin');
  perform public.launch_tournament_division('e2200000-0000-4000-8000-000000000003', 'isolated-launch-repair-admin');
end $$;
reset session authorization;
select pg_temp.launch_assert((select status='in_progress' and not registration_enabled from public.tournaments where id='e2100000-0000-4000-8000-000000000003'), 'last launch after Not Held');
select pg_temp.launch_assert((select launched_at is null from public.tournament_brackets where id='e2200000-0000-4000-8000-000000000007'), 'Not Held sibling was launched');
rollback;

-- Explicitly disabled registration is not reopened by launching a sibling.
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"isolated-launch-repair-admin"}';
insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players) values ('e2200000-0000-4000-8000-000000000007','e2100000-0000-4000-8000-000000000003','Main','1400-1799',8);
update public.tournaments set status='upcoming',registration_enabled=false where id='e2100000-0000-4000-8000-000000000003';
set session authorization service_role;
do $$ begin perform public.launch_tournament_division('e2200000-0000-4000-8000-000000000003', 'isolated-launch-repair-admin'); end $$;
reset session authorization;
select pg_temp.launch_assert((select status='in_progress' and not registration_enabled from public.tournaments where id='e2100000-0000-4000-8000-000000000003'), 'disabled mixed registration was reopened');
rollback;

-- Outer map-pool validation still rolls back the earlier parent and Division writes.
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"isolated-launch-repair-admin"}';
update public.tournament_brackets set map_pool_published_at=null where id='e2200000-0000-4000-8000-000000000003';
create temporary table launch_failure_snapshot as select count(*) as count from public.notifications;
set session authorization service_role;
do $$ begin
  begin
    perform public.launch_tournament_division('e2200000-0000-4000-8000-000000000003', 'isolated-launch-repair-admin');
    raise exception 'Unpublished pool unexpectedly launched';
  exception when raise_exception then
    if sqlerrm <> 'Publish the Division map pool before launch' then raise; end if;
  end;
end $$;
reset session authorization;
select pg_temp.launch_assert((select status='registration_open' and registration_enabled from public.tournaments where id='e2100000-0000-4000-8000-000000000003'), 'failed launch left partial Event state');
select pg_temp.launch_assert((select launched_at is null from public.tournament_brackets where id='e2200000-0000-4000-8000-000000000003'), 'failed launch left launched_at');
select pg_temp.launch_assert((select competition_locked_at is null from public.generated_brackets where tournament_bracket_id='e2200000-0000-4000-8000-000000000003'), 'failed launch left a roster lock');
select pg_temp.launch_assert((select count(*)=(select count from launch_failure_snapshot) from public.notifications), 'failed launch left notifications');
rollback;

-- Public roles remain denied the canonical launch RPC; the inner helper is owner-only.
begin;
set session authorization authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"isolated-player"}';
do $$ begin
  begin perform public.launch_tournament_division('e2200000-0000-4000-8000-000000000003', 'isolated-launch-repair-admin'); raise exception 'Authenticated role launched a Division';
  exception when insufficient_privilege then null; end;
end $$;
reset session authorization;
set session authorization anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ begin
  begin perform public.launch_tournament_division('e2200000-0000-4000-8000-000000000003', 'isolated-launch-repair-admin'); raise exception 'Anon role launched a Division';
  exception when insufficient_privilege then null; end;
end $$;
reset session authorization;
select pg_temp.launch_assert((not has_function_privilege('service_role','public.launch_tournament_division_without_matchup_activation(uuid,text)','EXECUTE')), 'inner helper became service-callable');
select pg_temp.launch_assert((not has_function_privilege('authenticated','public.launch_tournament_division_without_matchup_activation(uuid,text)','EXECUTE')), 'inner helper became player-callable');
rollback;
select 'canonical_division_launch_ordering_passed';

