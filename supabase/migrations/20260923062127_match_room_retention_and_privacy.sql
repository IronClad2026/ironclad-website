begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Privacy 1.3 preparation. No existing migration is rewritten. No competition
-- row is updated by this migration or by the maintenance functions below.
-- first_completed_at is first-ever completion, not the current closure. Observe
-- authoritative status transitions without inventing historical closure dates.
create table ironclad_private.match_room_tournament_closures (
  tournament_id uuid primary key,
  completed_at timestamptz not null
);
create function ironclad_private.observe_match_room_tournament_closure()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into ironclad_private.match_room_tournament_closures values(new.id, clock_timestamp())
    on conflict(tournament_id) do update set completed_at = excluded.completed_at;
  elsif new.status <> 'completed' then
    delete from ironclad_private.match_room_tournament_closures where tournament_id = new.id;
  end if;
  return new;
end $$;
create trigger tournaments_match_room_closure_observation after insert or update of status on public.tournaments
for each row execute function ironclad_private.observe_match_room_tournament_closure();

-- Non-content provenance permits privacy location after Clerk attribution is
-- scrubbed on account closure, including an administrator's authored messages.
-- It has no competitive FK and is never included in ordinary room projections.
alter table public.match_messages add column author_player_id uuid;
alter table public.match_messages disable trigger match_messages_protect_record;
update public.match_messages m set author_player_id = coalesce(
  (select r.profile_id from public.registrations r where r.id = m.sender_registration_id),
  (select p.id from public.players p where p.clerk_user_id = m.actor_clerk_user_id));
alter table public.match_messages enable trigger match_messages_protect_record;
create unique index match_messages_subject_idempotency_idx on public.match_messages(room_id,author_player_id,client_message_id) where author_player_id is not null;
create index match_messages_author_player_idx on public.match_messages(author_player_id,room_id) where author_player_id is not null;
create function ironclad_private.record_match_room_message_subject()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  new.author_player_id := coalesce(
    (select r.profile_id from public.registrations r where r.id = new.sender_registration_id),
    (select p.id from public.players p where p.clerk_user_id = new.actor_clerk_user_id));
  return new;
end $$;
create trigger match_messages_record_subject before insert on public.match_messages
for each row execute function ironclad_private.record_match_room_message_subject();
alter table public.match_rooms add column content_purged_at timestamptz;

-- External case references are explicit operator-verified authoritative IDs,
-- never a classifier over message text. Existing assistance/report authority is
-- consulted directly, so no migration manufactures a historical case or room.
create table ironclad_private.match_room_retention_cases (
  room_id uuid not null references public.match_rooms(id) on delete restrict,
  case_reference uuid not null,
  case_kind text not null check(case_kind in ('support','complaint','privacy','abuse_security','dispute','no_show','competition_integrity')),
  closed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(room_id,case_reference)
);
create table ironclad_private.match_room_retention_holds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.match_rooms(id) on delete restrict,
  message_ids uuid[],
  case_reference uuid not null,
  reason text not null check(reason in ('legal','security','abuse_safety','competition_integrity')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  released_at timestamptz,
  check(expires_at > created_at and expires_at <= created_at + interval '366 days'),
  check(message_ids is null or cardinality(message_ids) between 1 and 1000)
);
create index match_room_retention_holds_active_idx on ironclad_private.match_room_retention_holds(room_id,expires_at) where released_at is null;
create table ironclad_private.match_room_privacy_audit (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  operation text not null check(operation in ('purge','redact','hold','release_hold','case_link')),
  actor_player_id uuid not null,
  reference_id uuid,
  counts jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);
-- These records contain no message bodies, email, Clerk IDs or reason prose.
-- Audit/case/expired hold metadata is removed after 24 months when room content
-- has gone and no current case or hold requires continued protection.
create index match_room_privacy_audit_age_idx on ironclad_private.match_room_privacy_audit(occurred_at,room_id);
create table ironclad_private.match_room_redactions (
  message_id uuid primary key references public.match_messages(id) on delete cascade,
  redacted_at timestamptz not null default clock_timestamp()
);

create or replace function ironclad_private.protect_match_message_record()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if row(new.id,new.room_id,new.sequence,new.sender_kind,new.sender_registration_id,new.client_message_id,new.created_at,new.author_player_id)
    is distinct from row(old.id,old.room_id,old.sequence,old.sender_kind,old.sender_registration_id,old.client_message_id,old.created_at,old.author_player_id)
    or new.actor_clerk_user_id is not null then
    raise exception 'Match Room messages are immutable' using errcode='55000';
  end if;
  if new.body is distinct from old.body then
    if current_setting('ironclad.match_room_privacy_redaction',true) is distinct from 'on'
      or new.body <> '[removed following privacy request]' then
      raise exception 'Match Room messages are immutable' using errcode='55000';
    end if;
  elsif coalesce(current_setting('ironclad.match_room_account_closure',true),'') <> 'on'
    and coalesce(current_setting('ironclad.match_room_privacy_redaction',true),'') <> 'on' then
    raise exception 'Match Room messages are immutable' using errcode='55000';
  end if;
  return new;
end $$;

create function ironclad_private.match_room_privacy_actor(p_actor text)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid;
begin
  if session_user <> 'postgres' and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  -- Public execution is service-role-only. Trusted server/operator MUST verify
  -- the current Clerk admin claim; an actor string is not browser authority.
  select id into v_id from public.players where clerk_user_id=p_actor and account_closed_at is null;
  if v_id is null then raise exception 'Active privacy operator required' using errcode='42501'; end if;
  return v_id;
end $$;
create function ironclad_private.lock_match_room_privacy(p_room_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_match uuid; v_tournament uuid;
begin
  -- Same outer lock as account closure and room callers, before match/room.
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure',0));
  select match_id into v_match from public.match_rooms where id=p_room_id;
  if v_match is null then raise exception 'Room unavailable' using errcode='22023'; end if;
  perform 1 from public.tournament_matches where id=v_match for update nowait;
  select b.tournament_id into v_tournament from public.tournament_matches m
    join public.generated_brackets g on g.id=m.generated_bracket_id
    join public.tournament_brackets b on b.id=g.tournament_bracket_id where m.id=v_match;
  perform 1 from public.tournaments where id=v_tournament for share nowait;
  perform 1 from public.match_rooms where id=p_room_id for update nowait;
end $$;
-- Formal report transitions serialize with purge on the actual match row.
-- No report/result fields are modified. A transaction timeout fails closed.
create function ironclad_private.lock_match_room_case_authority()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_group public.match_result_report_groups%rowtype; v_closed timestamptz;
begin
  if tg_op='DELETE' then v_group:=old; else v_group:=new; end if;
  perform 1 from public.tournament_matches where id=v_group.match_id for update;
  if v_group.disputed_at is not null or v_group.result_type='no_show' or v_group.status in ('disputed','under_review') then
    if v_group.status in ('confirmed','auto_approved','approved','rejected','reset') then
      v_closed:=coalesce(v_group.finalized_at,v_group.reviewed_at);
    end if;
    -- Preserve only explicit formal-case provenance if competition maintenance
    -- resets/deletes the report. A vanished authority cannot revert evidence to
    -- routine chat. Unknown final result/closure remains fail-closed.
    insert into ironclad_private.match_room_retention_cases(room_id,case_reference,case_kind,closed_at)
    select r.id,v_group.id,case when v_group.result_type='no_show' then 'no_show' else 'dispute' end,v_closed
    from public.match_rooms r where r.match_id=v_group.match_id
      and v_group.submitted_by_registration_id in(r.player_one_registration_id,r.player_two_registration_id)
      and v_group.opponent_registration_id in(r.player_one_registration_id,r.player_two_registration_id)
    on conflict(room_id,case_reference) do update set closed_at=excluded.closed_at,updated_at=clock_timestamp();
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger match_result_groups_match_room_retention_lock before insert or update or delete on public.match_result_report_groups
for each row execute function ironclad_private.lock_match_room_case_authority();

create function ironclad_private.match_room_retention_state(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare r record; a record; c record; v_closed timestamptz; v_case timestamptz;
  v_result timestamptz; v_open boolean:=false; v_formal boolean:=false; v_result_case boolean:=false;
  v_block text; v_total bigint; v_held bigint; v_eligible bigint; v_whole_hold boolean;
begin
  select room.*,t.id tournament_id,t.status terminal_status,t.terminal_at,m.status match_status,
    m.official_result_decided_at,m.deadline_ruled_at,obs.completed_at,
    m.player_one_registration_id current_player_one,m.player_two_registration_id current_player_two
  into r from public.match_rooms room
  left join public.tournament_matches m on m.id=room.match_id
  left join public.generated_brackets g on g.id=m.generated_bracket_id
  left join public.tournament_brackets b on b.id=g.tournament_bracket_id
  left join public.tournaments t on t.id=b.tournament_id
  left join ironclad_private.match_room_tournament_closures obs on obs.tournament_id=t.id
  where room.id=p_room_id;
  if not found then raise exception 'Room unavailable' using errcode='22023'; end if;
  if r.terminal_status in ('cancelled','voided') then v_closed:=r.terminal_at;
  elsif r.terminal_status='completed' then v_closed:=r.completed_at; end if;
  if r.match_status='completed' and (
    (r.current_player_one=r.player_one_registration_id and r.current_player_two=r.player_two_registration_id)
    or (r.current_player_one=r.player_two_registration_id and r.current_player_two=r.player_one_registration_id)) then
    v_result:=coalesce(r.official_result_decided_at,r.deadline_ruled_at);
  end if;
  select * into a from public.match_room_assistance where room_id=p_room_id;
  if found then
    v_formal:=true;
    if a.status <> 'resolved' or a.resolved_at is null then v_open:=true;
    else v_case:=a.resolved_at+interval '24 months'; end if;
  end if;
  if exists(select 1 from public.match_result_report_groups x where x.match_id=r.match_id
    and x.submitted_by_registration_id in (r.player_one_registration_id,r.player_two_registration_id)
    and x.opponent_registration_id in (r.player_one_registration_id,r.player_two_registration_id)
    and (x.disputed_at is not null or x.result_type='no_show' or x.status in ('disputed','under_review'))) then
    v_formal:=true; v_result_case:=true;
    if exists(select 1 from public.match_result_report_groups x where x.match_id=r.match_id
      and x.submitted_by_registration_id in (r.player_one_registration_id,r.player_two_registration_id)
      and x.opponent_registration_id in (r.player_one_registration_id,r.player_two_registration_id)
      and (x.disputed_at is not null or x.result_type='no_show' or x.status in ('disputed','under_review'))
      and x.status not in ('confirmed','auto_approved','approved','rejected','reset')) then v_open:=true; end if;
  end if;
  for c in select * from ironclad_private.match_room_retention_cases where room_id=p_room_id loop
    v_formal:=true;
    if c.closed_at is null then v_open:=true;
    elsif c.case_kind in ('dispute','no_show','competition_integrity') then v_result_case:=true;
    else v_case:=greatest(v_case,c.closed_at+interval '24 months'); end if;
  end loop;
  if v_result_case then
    if v_result is null then v_open:=true;
    else v_case:=greatest(v_case,v_result+interval '24 months'); end if;
  end if;
  if v_closed is null then v_block:='tournament_not_terminal_or_closure_unknown';
  elsif v_closed>clock_timestamp() then v_block:='closure_in_future';
  elsif v_open then v_block:='formal_case_open_or_result_not_final';
  elsif v_case>now() then v_block:='formal_case_retention';
  elsif v_closed+interval '40 days'>now() then v_block:='routine_retention'; end if;
  select count(*) into v_total from public.match_messages where room_id=p_room_id;
  select exists(select 1 from ironclad_private.match_room_retention_holds h where h.room_id=p_room_id
    and h.released_at is null and h.expires_at>now() and h.message_ids is null) into v_whole_hold;
  select count(*) into v_held from public.match_messages m where m.room_id=p_room_id and exists(
    select 1 from ironclad_private.match_room_retention_holds h where h.room_id=p_room_id
      and h.released_at is null and h.expires_at>now() and (h.message_ids is null or m.id=any(h.message_ids)));
  v_eligible:=case when v_block is null and not v_whole_hold then v_total-v_held else 0 end;
  if v_block is null and v_whole_hold then v_block:='active_room_hold'; end if;
  return jsonb_build_object('roomId',r.id,'tournamentId',r.tournament_id,'terminalStatus',r.terminal_status,
    'closedAt',v_closed,'retentionClass',case when v_formal then 'formal_case' else 'routine' end,
    'routineEligibleAt',v_closed+interval '40 days','caseEligibleAt',v_case,'blockedReason',v_block,
    'messageCount',v_total,'heldMessageCount',v_held,'eligibleMessageCount',v_eligible,
    'formalCaseBlocked',v_open or coalesce(v_case>now(),false),'contentPurgedAt',r.content_purged_at);
end $$;

create function public.preview_match_room_retention(p_room_ids uuid[],p_actor_clerk_user_id text,p_after_room_id uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_rooms jsonb;
begin
  perform ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_room_ids is not null and (cardinality(p_room_ids) not between 1 and 100 or array_position(p_room_ids,null) is not null) then
    raise exception 'Select 1 to 100 rooms' using errcode='22023'; end if;
  -- LIMIT applies before any per-room message/case/hold inspection. The cursor
  -- advances past blocked candidates so they cannot starve later eligible rooms.
  with candidates as materialized (
    select id,created_at from public.match_rooms where (p_room_ids is not null and id=any(p_room_ids))
      or (p_room_ids is null and (p_after_room_id is null or id>p_after_room_id))
    order by id limit 100
  ) select coalesce(jsonb_agg(ironclad_private.match_room_retention_state(id) order by id),'[]') into v_rooms from candidates;
  return jsonb_build_object('rooms',v_rooms,'nextRoomId',case when p_room_ids is null and jsonb_array_length(v_rooms)=100 then v_rooms->-1->>'roomId' end,
    'policy',jsonb_build_object('routineDays',40,'supportMonths',24,'resultMonths',24));
end $$;

create function public.purge_match_room_retention(p_room_ids uuid[],p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor uuid; v_room uuid; s jsonb; n integer; v_count integer:=0; v_messages integer:=0;
  v_before int[]; v_reads integer:=0; v_episodes integer:=0; v_assistance integer:=0; v_notifications integer:=0; v_notices uuid[];
begin
  v_actor:=ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_room_ids is null or cardinality(p_room_ids) not between 1 and 100 or array_position(p_room_ids,null) is not null then
    raise exception 'Select 1 to 100 rooms' using errcode='22023'; end if;
  for v_room in select distinct unnest(p_room_ids) order by 1 loop
    perform ironclad_private.lock_match_room_privacy(v_room);
    perform ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
    s:=ironclad_private.match_room_retention_state(v_room);
    if s->>'blockedReason' is not null then continue; end if;
    v_before:=array[v_messages,v_reads,v_episodes,v_assistance,v_notifications];
    -- Delete at most 1000 bodies per room per call. Repeating the same bounded
    -- batch resumes safely; last_sequence and immutable room identity remain.
    delete from public.match_messages where id in (
      select m.id from public.match_messages m where m.room_id=v_room and not exists(
        select 1 from ironclad_private.match_room_retention_holds h where h.room_id=v_room
          and h.released_at is null and h.expires_at>now() and (h.message_ids is null or m.id=any(h.message_ids)))
      order by m.sequence limit 1000);
    get diagnostics n=row_count; v_messages:=v_messages+n;
    if not exists(select 1 from public.match_messages where room_id=v_room) then
      select array_agg(id) into v_notices from (
        (select notification_id id from public.match_room_notification_episodes where room_id=v_room order by id limit 1000)
        union select notification_id from public.match_room_assistance where room_id=v_room) ids where id is not null;
      delete from public.match_room_reads where (room_id,viewer_clerk_user_id) in (select room_id,viewer_clerk_user_id from public.match_room_reads where room_id=v_room order by viewer_clerk_user_id limit 1000); get diagnostics n=row_count; v_reads:=v_reads+n;
      delete from public.match_room_notification_episodes where id in (select id from public.match_room_notification_episodes where room_id=v_room order by id limit 1000); get diagnostics n=row_count; v_episodes:=v_episodes+n;
      delete from public.match_room_assistance where room_id=v_room; get diagnostics n=row_count; v_assistance:=v_assistance+n;
      delete from public.notifications where id in (select id from public.notifications
        where (id=any(v_notices) or (metadata->>'roomId'=v_room::text
          and match_id=(select match_id from public.match_rooms where id=v_room)
          and type in ('match.message_received','match.admin_assistance_requested')))
        order by id limit 1000); get diagnostics n=row_count; v_notifications:=v_notifications+n;
      if not exists(select 1 from public.match_room_reads where room_id=v_room)
        and not exists(select 1 from public.match_room_notification_episodes where room_id=v_room)
        and not exists(select 1 from public.notifications where metadata->>'roomId'=v_room::text
          and match_id=(select match_id from public.match_rooms where id=v_room)
          and type in ('match.message_received','match.admin_assistance_requested')) then
      update public.match_rooms set content_purged_at=coalesce(content_purged_at,clock_timestamp()),
        closed_at=coalesce(closed_at,clock_timestamp()),closure_reason=coalesce(closure_reason,'tournament_closed') where id=v_room;
      end if;
      delete from ironclad_private.match_room_retention_cases where (room_id,case_reference) in (select room_id,case_reference from ironclad_private.match_room_retention_cases where room_id=v_room and closed_at<now()-interval '24 months' order by case_reference limit 1000);
      delete from ironclad_private.match_room_retention_holds where id in(select id from ironclad_private.match_room_retention_holds where room_id=v_room and coalesce(released_at,expires_at)<now()-interval '24 months' order by id limit 1000);
      delete from ironclad_private.match_room_privacy_audit where id in(select id from ironclad_private.match_room_privacy_audit where room_id=v_room and occurred_at<now()-interval '24 months' order by id limit 1000);
    end if;
    v_count:=v_count+1;
    if array[v_messages,v_reads,v_episodes,v_assistance,v_notifications] is distinct from v_before then
      insert into ironclad_private.match_room_privacy_audit(room_id,operation,actor_player_id,counts)
      values(v_room,'purge',v_actor,jsonb_build_object('messagesDeleted',v_messages-v_before[1],
        'readsDeleted',v_reads-v_before[2],'episodesDeleted',v_episodes-v_before[3],
        'assistanceDeleted',v_assistance-v_before[4],'notificationsDeleted',v_notifications-v_before[5]));
    end if;
  end loop;
  return jsonb_build_object('roomsProcessed',v_count,'messagesDeleted',v_messages,'readsDeleted',v_reads,
    'episodesDeleted',v_episodes,'assistanceDeleted',v_assistance,'notificationsDeleted',v_notifications);
end $$;

create function public.locate_match_room_privacy_data(p_player_id uuid,p_after_room_id uuid,p_limit int,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_rows jsonb;
begin
  perform ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_player_id is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid privacy scope' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('roomId',x.id,'matchId',x.match_id,
    'messageCount',(select count(*) from public.match_messages m where m.room_id=x.id),
    'ownMessageCount',(select count(*) from public.match_messages m where m.room_id=x.id and m.author_player_id=p_player_id)) order by x.id),'[]') into v_rows
  from (select r.id,r.match_id from public.match_rooms r where (p_after_room_id is null or r.id>p_after_room_id)
    and (exists(select 1 from public.registrations a where a.id in(r.player_one_registration_id,r.player_two_registration_id) and a.profile_id=p_player_id)
      or exists(select 1 from public.match_messages m where m.room_id=r.id and m.author_player_id=p_player_id))
    order by r.id limit p_limit) x;
  return jsonb_build_object('playerId',p_player_id,'rooms',v_rows,'nextRoomId',case when jsonb_array_length(v_rows)=p_limit then v_rows->-1->>'roomId' end);
end $$;
create function public.export_match_room_privacy_data(p_player_id uuid,p_room_id uuid,p_after_sequence bigint,p_limit int,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_rows jsonb; v_participant boolean;
begin
  perform ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_player_id is null or p_room_id is null or p_limit is null or p_limit not between 1 and 500 or coalesce(p_after_sequence,0)<0 then
    raise exception 'Invalid privacy scope' using errcode='22023'; end if;
  select exists(select 1 from public.match_rooms r join public.registrations a
    on a.id in(r.player_one_registration_id,r.player_two_registration_id) where r.id=p_room_id and a.profile_id=p_player_id) into v_participant;
  if not v_participant and not exists(select 1 from public.match_messages where room_id=p_room_id and author_player_id=p_player_id) then
    raise exception 'Room is not linked to subject' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'sequence',x.sequence,'senderKind',x.sender_kind,
    'isSubjectSender',coalesce(x.author_player_id=p_player_id,false),'body',x.body,'createdAt',x.created_at) order by x.sequence),'[]') into v_rows
  from (select m.* from public.match_messages m where m.room_id=p_room_id and m.sequence>coalesce(p_after_sequence,0)
    and (v_participant or m.author_player_id=p_player_id) order by m.sequence limit p_limit) x;
  return jsonb_build_object('roomId',p_room_id,'playerId',p_player_id,'messages',v_rows,
    'nextSequence',case when jsonb_array_length(v_rows)=p_limit then (v_rows->-1->>'sequence')::bigint end);
end $$;

create function public.link_match_room_retention_case(p_room_id uuid,p_case_reference uuid,p_case_kind text,p_closed_at timestamptz,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor uuid;
begin
  v_actor:=ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_case_reference is null or p_case_kind is null or p_case_kind not in('support','complaint','privacy','abuse_security','dispute','no_show','competition_integrity')
    or p_closed_at>now() then raise exception 'Invalid authoritative case metadata' using errcode='22023'; end if;
  perform ironclad_private.lock_match_room_privacy(p_room_id);
  perform ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if exists(select 1 from ironclad_private.match_room_retention_cases where room_id=p_room_id and case_reference=p_case_reference and case_kind<>p_case_kind) then
    raise exception 'Case kind is immutable' using errcode='22023'; end if;
  insert into ironclad_private.match_room_retention_cases(room_id,case_reference,case_kind,closed_at)
    values(p_room_id,p_case_reference,p_case_kind,p_closed_at)
  on conflict(room_id,case_reference) do update set closed_at=excluded.closed_at,updated_at=clock_timestamp();
  insert into ironclad_private.match_room_privacy_audit(room_id,operation,actor_player_id,reference_id)
    values(p_room_id,'case_link',v_actor,p_case_reference);
  return jsonb_build_object('roomId',p_room_id,'caseReference',p_case_reference,'caseKind',p_case_kind,'closedAt',p_closed_at);
end $$;
create function public.set_match_room_retention_hold(p_room_id uuid,p_message_ids uuid[],p_case_reference uuid,p_reason text,p_expires_at timestamptz,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor:=ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_case_reference is null or p_reason is null or p_reason not in('legal','security','abuse_safety','competition_integrity')
    or p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '366 days'
    or (p_message_ids is not null and (cardinality(p_message_ids) not between 1 and 1000 or array_position(p_message_ids,null) is not null)) then
    raise exception 'Invalid bounded hold' using errcode='22023'; end if;
  perform ironclad_private.lock_match_room_privacy(p_room_id);
  perform ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_message_ids is not null and exists(select 1 from unnest(p_message_ids) as scope(message_id) where not exists(select 1 from public.match_messages m where m.id=scope.message_id and m.room_id=p_room_id)) then
    raise exception 'Hold scope contains unavailable message' using errcode='22023'; end if;
  insert into ironclad_private.match_room_retention_holds(room_id,message_ids,case_reference,reason,expires_at)
    values(p_room_id,p_message_ids,p_case_reference,p_reason,p_expires_at) returning id into v_id;
  insert into ironclad_private.match_room_privacy_audit(room_id,operation,actor_player_id,reference_id)
    values(p_room_id,'hold',v_actor,v_id);
  return jsonb_build_object('holdId',v_id,'roomId',p_room_id,'expiresAt',p_expires_at);
end $$;
create function public.release_match_room_retention_hold(p_hold_id uuid,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor uuid; v_room uuid; n integer;
begin
  v_actor:=ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  select room_id into v_room from ironclad_private.match_room_retention_holds where id=p_hold_id;
  perform ironclad_private.lock_match_room_privacy(v_room);
  perform ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  update ironclad_private.match_room_retention_holds set released_at=clock_timestamp() where id=p_hold_id and released_at is null;
  get diagnostics n=row_count;
  if n>0 then insert into ironclad_private.match_room_privacy_audit(room_id,operation,actor_player_id,reference_id)
    values(v_room,'release_hold',v_actor,p_hold_id); end if;
  return jsonb_build_object('holdId',p_hold_id,'released',true);
end $$;
create function public.redact_match_room_messages(p_player_id uuid,p_room_id uuid,p_message_ids uuid[],p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor uuid; n integer; s jsonb;
begin
  v_actor:=ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_player_id is null or p_message_ids is null or cardinality(p_message_ids) not between 1 and 1000 or array_position(p_message_ids,null) is not null then
    raise exception 'Invalid bounded redaction' using errcode='22023'; end if;
  perform ironclad_private.lock_match_room_privacy(p_room_id);
  perform ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if exists(select 1 from unnest(p_message_ids) as scope(message_id) where not exists(select 1 from public.match_messages m where m.id=scope.message_id and m.room_id=p_room_id and m.author_player_id=p_player_id)) then
    raise exception 'Redaction scope is not authored by subject' using errcode='42501'; end if;
  s:=ironclad_private.match_room_retention_state(p_room_id);
  if (s->>'formalCaseBlocked')::boolean or exists(select 1 from ironclad_private.match_room_retention_holds h where h.room_id=p_room_id
    and h.released_at is null and h.expires_at>now() and (h.message_ids is null or h.message_ids && p_message_ids)) then
    raise exception 'Retained case or hold prevents ordinary redaction' using errcode='55000'; end if;
  perform set_config('ironclad.match_room_privacy_redaction','on',true);
  with changed as (
    update public.match_messages m set body='[removed following privacy request]',actor_clerk_user_id=null
    where m.id=any(p_message_ids) and m.room_id=p_room_id and m.author_player_id=p_player_id and not exists(select 1 from ironclad_private.match_room_redactions r where r.message_id=m.id)
    returning id
  ) insert into ironclad_private.match_room_redactions(message_id) select id from changed;
  get diagnostics n=row_count;
  perform set_config('ironclad.match_room_privacy_redaction','off',true);
  if n>0 then insert into ironclad_private.match_room_privacy_audit(room_id,operation,actor_player_id,counts)
    values(p_room_id,'redact',v_actor,jsonb_build_object('redactedCount',n)); end if;
  return jsonb_build_object('redactedCount',n);
end $$;

-- Tombstones cannot acquire fresh private operational state after purge.
create function ironclad_private.reject_purged_match_room_state()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if exists(select 1 from public.match_rooms where id=new.room_id and content_purged_at is not null) then
    raise exception 'Match Room content has expired' using errcode='55000';
  end if;
  return new;
end $$;
create trigger match_room_reads_no_purged_state before insert or update on public.match_room_reads
for each row execute function ironclad_private.reject_purged_match_room_state();
create trigger match_room_assistance_no_purged_state before insert or update on public.match_room_assistance
for each row execute function ironclad_private.reject_purged_match_room_state();
create trigger match_room_episodes_no_purged_state before insert or update on public.match_room_notification_episodes
for each row execute function ironclad_private.reject_purged_match_room_state();
revoke all on function ironclad_private.reject_purged_match_room_state() from public,anon,authenticated,service_role;

-- No browser or raw service table access. Explicit operator RPCs are the sole
-- service boundary; inner helpers and observer functions are owner-only.
do $$
declare n text; signature text;
begin
  foreach n in array array['match_room_tournament_closures','match_room_retention_cases','match_room_retention_holds','match_room_privacy_audit','match_room_redactions'] loop
    execute format('alter table ironclad_private.%I enable row level security',n);
    execute format('alter table ironclad_private.%I force row level security',n);
    execute format('revoke all on ironclad_private.%I from public,anon,authenticated,service_role',n);
  end loop;
  foreach signature in array array[
    'ironclad_private.observe_match_room_tournament_closure()','ironclad_private.record_match_room_message_subject()',
    'ironclad_private.match_room_privacy_actor(text)','ironclad_private.lock_match_room_privacy(uuid)',
    'ironclad_private.lock_match_room_case_authority()','ironclad_private.match_room_retention_state(uuid)'] loop
    execute 'revoke all on function '||signature||' from public,anon,authenticated,service_role';
  end loop;
  foreach signature in array array[
    'public.preview_match_room_retention(uuid[],text,uuid)','public.purge_match_room_retention(uuid[],text)',
    'public.locate_match_room_privacy_data(uuid,uuid,integer,text)','public.export_match_room_privacy_data(uuid,uuid,bigint,integer,text)',
    'public.link_match_room_retention_case(uuid,uuid,text,timestamptz,text)',
    'public.set_match_room_retention_hold(uuid,uuid[],uuid,text,timestamptz,text)',
    'public.release_match_room_retention_hold(uuid,text)','public.redact_match_room_messages(uuid,uuid,uuid[],text)'] loop
    execute 'alter function '||signature||' owner to postgres';
    execute 'revoke all on function '||signature||' from public,anon,authenticated,service_role';
    execute 'grant execute on function '||signature||' to service_role';
    execute 'alter function '||signature||' set lock_timeout=''2s''';
    execute 'alter function '||signature||' set statement_timeout=''60s''';
  end loop;
end $$;
comment on column public.match_messages.author_player_id is 'Internal subject provenance only, retained with content after account closure; no public projection or competitive FK.';
comment on column public.match_rooms.content_purged_at is 'Minimal purge tombstone; immutable room/generation/last-sequence prevents conversation resurrection.';
commit;
