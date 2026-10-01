-- Synthetic disposable-local-only coherent inputs. Normal result/settlement RPCs perform all scored transitions.
-- Derived from inspected lifecycle helper structure; fresh namespace, genuine versioned snapshot shape, no Staging identity or authority.
create function pg_temp.fd_id(kind text,event integer,slot integer default 0)
returns uuid language sql immutable as $$
  select md5('consolidated-production-rehearsal:'||kind||':'||event||':'||slot)::uuid;
$$;
create temporary table fd_assertions(message text);
create function pg_temp.fd_assert(ok boolean,message text)
returns void language plpgsql security definer set search_path=pg_catalog as $$ begin
  if ok is distinct from true then raise exception 'Consolidated lifecycle: %',message; end if;
  insert into pg_temp.fd_assertions values(message);
end $$;

create function pg_temp.fd_create(event integer,division text,player_group integer default 0)
returns uuid language plpgsql as $$
declare
  tid uuid:=pg_temp.fd_id('event',event);
  bid uuid:=pg_temp.fd_id(division,event);
  gid uuid:=pg_temp.fd_id(division||'-generated',event);
  pid uuid; rid uuid; rd uuid; idx integer; round_no integer; match_no integer;
  elo integer:=case division when 'Academy' then 1000 when 'Challenge' then 1250 when 'Pro' then 1800 when 'Main' then case when current_setting('ironclad.test_model',true)='four_division_v1' then 1500 else 1800 end end;
begin
  perform set_config('session_replication_role','replica',true);
  insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,registration_enabled)
  values(tid,'Local consolidated '||event,'local-consolidated-'||event,'1v1','in_progress','Disposable local lifecycle inputs','','',false)
  on conflict(id) do nothing;
  if current_setting('ironclad.test_model',true)='four_division_v1' then
    execute 'update public.tournaments set division_model_version=$1 where id=$2' using 'four_division_v1',tid;
  end if;
  insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players,launched_at)
  values(bid,tid,division,case division when 'Academy' then 'Below 1100 ELO' when 'Challenge' then '1100-1399 ELO' when 'Pro' then '1700+ ELO' else '1400+ ELO' end,8,now());
  for idx in 1..8 loop
    pid:=pg_temp.fd_id(division||'-player',player_group,idx);
    rid:=pg_temp.fd_id(division||'-registration',event,idx);
    insert into public.players(id,clerk_user_id,display_name,in_game_name,current_elo,profile_completed)
    values(pid,'local-consolidated-'||pid,'Local fixture '||idx,'Local fixture '||idx,elo,true)
    on conflict(id) do nothing;
    insert into public.registrations(id,profile_id,clerk_user_id,player_name,submitted_elo,tournament_title,bracket_name,registration_status,elo_status,tournament_id,tournament_bracket_id,elo_verified_elo,elo_highest_faction,elo_checked_mode,elo_checked_at,elo_verification_source,elo_verified_division,elo_calculation_version)
    values(rid,pid,'local-consolidated-'||pid,'Local fixture '||idx,elo,'Local consolidated '||event,division,'approved','verified',tid,bid,elo,'US Forces','1v1',now(),'relic',case when division='Main' and current_setting('ironclad.test_model',true) is distinct from 'four_division_v1' then 'Main / Pro' else division end,case when current_setting('ironclad.test_model',true)='four_division_v1' then 'relic-highest-1v1-v2' else 'relic-highest-1v1-v1' end);
  end loop;
  insert into public.generated_brackets(id,tournament_bracket_id,format,participant_count,slot_count,generated_by,competition_locked_at)
  values(gid,bid,'single_elimination',8,8,'local-consolidated-admin',now());
  for round_no in 1..3 loop
    rd:=pg_temp.fd_id(division||'-round',event,round_no);
    insert into public.bracket_rounds(id,generated_bracket_id,round_number,name)
    values(rd,gid,round_no,case round_no when 1 then 'Quarter Finals' when 2 then 'Semi Finals' else 'Grand Final' end);
    for match_no in 1..(8/power(2,round_no)::integer) loop
      insert into public.tournament_matches(id,generated_bracket_id,round_id,match_number,
        player_one_slot,player_two_slot,player_one_registration_id,player_two_registration_id,
        status,series_best_of,activation_version,activated_at,deadline_at)
      values(pg_temp.fd_id(division||'-match-'||round_no,event,match_no),gid,rd,match_no,
        case when round_no=1 then match_no*2-1 end,case when round_no=1 then match_no*2 end,
        case when round_no=1 then pg_temp.fd_id(division||'-registration',event,match_no*2-1) end,
        case when round_no=1 then pg_temp.fd_id(division||'-registration',event,match_no*2) end,
        case when round_no=1 then 'in_progress' else 'scheduled' end,
        case when round_no=3 then 5 else 3 end,case when round_no=1 then 1 else 0 end,
        case when round_no=1 then now() end,case when round_no=1 then now()+interval '1 day' end);
    end loop;
  end loop;
  perform set_config('session_replication_role','origin',true);
  return bid;
end $$;

create function pg_temp.fd_play(event integer,division text,p_limit integer default 7)
returns void language plpgsql as $$
declare m record; played integer:=0;
begin
  loop
    select tm.* into m from public.tournament_matches tm
    join public.bracket_rounds r on r.id=tm.round_id
    where tm.generated_bracket_id=pg_temp.fd_id(division||'-generated',event)
      and tm.status='in_progress' and tm.player_one_registration_id is not null
      and tm.player_two_registration_id is not null
    order by r.round_number,tm.match_number limit 1;
    exit when not found;
    perform public.apply_admin_official_match_result_api(m.id,m.series_best_of/2+1,0,m.player_one_registration_id,'local-consolidated-admin');
    played:=played+1;
    exit when played=p_limit;
  end loop;
  if p_limit<7 then
    perform pg_temp.fd_assert(played=p_limit,'race setup failed to complete expected preliminary matches');
    return;
  end if;
  perform pg_temp.fd_assert(played=7,'full eight-player '||division||' bracket did not play seven matches');
  perform pg_temp.fd_assert(public.is_generated_bracket_complete(pg_temp.fd_id(division||'-generated',event)),'normal result advancement did not complete '||division);
  perform public.settle_leaderboard_division(pg_temp.fd_id(division,event),null);
end $$;
