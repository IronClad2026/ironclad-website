begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Additive private conversations. Legacy notification requests and the former
-- shared room flag retain their original identities; neither becomes a thread.
alter table public.assistance_requests drop constraint assistance_requests_source_kind_check;
alter table public.assistance_requests add constraint assistance_requests_source_kind_check
  check (source_kind in ('legacy_notification','private_match_room'));
alter table public.assistance_requests
  add column room_id uuid references public.match_rooms(id) on delete restrict,
  add column match_id uuid,
  add column tournament_bracket_id uuid,
  add column requester_registration_id uuid,
  add column requester_player_id uuid,
  add column creation_client_message_id uuid,
  add column last_sequence bigint not null default 0,
  add column content_purged_at timestamptz,
  add constraint assistance_requests_private_shape check (
    (source_kind = 'legacy_notification' and room_id is null and match_id is null
      and tournament_bracket_id is null and requester_registration_id is null
      and requester_player_id is null and creation_client_message_id is null
      and last_sequence = 0 and content_purged_at is null)
    or (source_kind = 'private_match_room' and source_notification_id is null
      and room_id is not null and match_id is not null
      and tournament_bracket_id is not null and requester_registration_id is not null
      and requester_player_id is not null and creation_client_message_id is not null
      and version <= 9007199254740991 and last_sequence between 0 and 9007199254740991));
create unique index assistance_requests_requester_room_idx
  on public.assistance_requests(room_id,requester_player_id) where source_kind='private_match_room';
create index assistance_requests_private_queue_idx
  on public.assistance_requests(tournament_id,status,updated_at desc,id desc)
  where source_kind='private_match_room';
create index assistance_requests_private_subject_idx
  on public.assistance_requests(requester_player_id,id) where source_kind='private_match_room';

create table public.assistance_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.assistance_requests(id) on delete restrict,
  sequence bigint not null check(sequence between 1 and 9007199254740991),
  sender_kind text not null check(sender_kind in ('requester','admin')),
  author_player_id uuid not null,
  actor_clerk_user_id text,
  client_message_id uuid not null,
  body text,
  body_sha256 bytea check(body_sha256 is null or octet_length(body_sha256)=32),
  created_at timestamptz not null default clock_timestamp(),
  redacted_at timestamptz,
  check ((body is not null and char_length(body) between 1 and 1000 and redacted_at is null and body_sha256 is not null)
    or (body is null and redacted_at is not null and body_sha256 is null)),
  unique(request_id,sequence),
  unique(request_id,author_player_id,client_message_id)
);
create index assistance_messages_subject_idx on public.assistance_messages(author_player_id,request_id,sequence);
create index assistance_messages_rate_idx on public.assistance_messages(author_player_id,created_at);
alter table public.assistance_messages enable row level security;
revoke all on public.assistance_messages from public,anon,authenticated,service_role;

-- The only switch controls NEW creation. Existing history, replies and admin
-- triage remain usable during rollback or a chat/room feature shutdown.
insert into public.platform_settings(key,value)
values('private_assistance_new_requests_enabled','{"enabled":false}'::jsonb)
on conflict(key) do nothing;

create function ironclad_private.private_assistance_actor(p_require_player boolean default false)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_sub text:=nullif(btrim(auth.jwt()->>'sub'),''); v_player uuid;
begin
  if auth.role() is distinct from 'authenticated' or v_sub is null then
    raise exception 'Assistance unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure',0));
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-actor:'||v_sub,0));
  select id into v_player from public.players where clerk_user_id=v_sub and account_closed_at is null;
  if v_player is null and (p_require_player or coalesce(auth.jwt()->'metadata'->>'role','')<>'admin') then
    raise exception 'Active assistance account required' using errcode='42501'; end if;
  return v_player;
end $$;

create function ironclad_private.private_assistance_enabled()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select value->'enabled'='true'::jsonb from public.platform_settings
    where key='private_assistance_new_requests_enabled'),false);
$$;

create function ironclad_private.private_assistance_body(p_body text)
returns void language plpgsql immutable set search_path=pg_catalog as $$
begin
  -- Unicode whitespace, including zero-width/BOM characters, is not an issue.
  if p_body is null or char_length(p_body) not between 1 and 1000
    or length(translate(p_body,E' \t\n\r\v\f'||chr(133)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8203)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(8288)||chr(12288)||chr(65279),''))=0 then
    raise exception 'MESSAGE_REQUIRED: explain the issue in 1 to 1000 characters' using errcode='22023'; end if;
end $$;

create function ironclad_private.protect_private_assistance_request()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if (case when tg_op='INSERT' then new.source_kind='private_match_room'
      when tg_op='DELETE' then old.source_kind='private_match_room'
      else old.source_kind='private_match_room' or new.source_kind='private_match_room' end)
    and current_user<>'postgres' then
    raise exception 'Use the private assistance authorities' using errcode='42501'; end if;
  if tg_op='DELETE' and old.source_kind='private_match_room' then
    raise exception 'Private assistance identities are retained' using errcode='55000'; end if;
  if tg_op='UPDATE' and (old.source_kind='private_match_room' or new.source_kind='private_match_room')
    and row(new.id,new.source_kind,new.source_notification_id,new.room_id,new.match_id,
      new.tournament_id,new.tournament_bracket_id,new.requester_registration_id,
      new.requester_player_id,new.creation_client_message_id,new.created_at)
    is distinct from row(old.id,old.source_kind,old.source_notification_id,old.room_id,old.match_id,
      old.tournament_id,old.tournament_bracket_id,old.requester_registration_id,
      old.requester_player_id,old.creation_client_message_id,old.created_at) then
    raise exception 'Private assistance context is immutable' using errcode='55000'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger assistance_requests_private_guard before insert or update or delete on public.assistance_requests
  for each row execute function ironclad_private.protect_private_assistance_request();

create function ironclad_private.protect_private_assistance_message()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if current_user<>'postgres' then raise exception 'Use the private assistance authorities' using errcode='42501'; end if;
  if tg_op='INSERT' then return new; end if;
  if tg_op='DELETE' then
    if current_setting('ironclad.private_assistance_purge',true) is distinct from 'on'
      or not exists(select 1 from public.assistance_requests a where a.id=old.request_id and a.content_purged_at is not null) then
      raise exception 'Private assistance messages are retained' using errcode='55000'; end if;
    return old;
  end if;
  if row(new.id,new.request_id,new.sequence,new.sender_kind,new.author_player_id,new.client_message_id,
      new.created_at) is distinct from row(old.id,old.request_id,old.sequence,old.sender_kind,
      old.author_player_id,old.client_message_id,old.created_at)
    or (new.actor_clerk_user_id is distinct from old.actor_clerk_user_id and new.actor_clerk_user_id is not null)
    or (row(new.body,new.redacted_at,new.body_sha256) is distinct from row(old.body,old.redacted_at,old.body_sha256)
      and (current_setting('ironclad.private_assistance_redaction',true) is distinct from 'on'
        or new.body is not null or new.redacted_at is null or new.body_sha256 is not null)) then
    raise exception 'Private assistance messages are immutable' using errcode='55000'; end if;
  return new;
end $$;
create trigger assistance_messages_guard before insert or update or delete on public.assistance_messages
  for each row execute function ironclad_private.protect_private_assistance_message();

create function ironclad_private.private_assistance_request_json(p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('id',a.id,'roomId',a.room_id,'tournamentId',a.tournament_id,
    'tournamentBracketId',a.tournament_bracket_id,'matchId',a.match_id,
    'requesterRegistrationId',a.requester_registration_id,'requesterName',coalesce(p.display_name,r.player_name,'Player'),
    'status',a.status,'version',a.version,'lastSequence',a.last_sequence,
    'createdAt',a.created_at,'updatedAt',a.updated_at,'resolvedAt',a.resolved_at,'contentPurgedAt',a.content_purged_at,
    'tournamentTitle',coalesce(t.title,r.tournament_title,'Tournament'),
    'divisionName',coalesce(b.name,r.bracket_name,'Division'),
    'matchReference',case when m.match_number is null then a.match_id::text
      else 'Round '||coalesce(br.round_number::text,'?')||' / Match '||m.match_number end,
    'reference',coalesce(t.title,r.tournament_title,'Tournament')||' / '||coalesce(b.name,r.bracket_name,'Division')||' / '||a.match_id::text)
  from public.assistance_requests a
  left join public.players p on p.id=a.requester_player_id
  left join public.registrations r on r.id=a.requester_registration_id
  left join public.tournaments t on t.id=a.tournament_id
  left join public.tournament_brackets b on b.id=a.tournament_bracket_id
  left join public.tournament_matches m on m.id=a.match_id
  left join public.bracket_rounds br on br.id=m.round_id
  where a.id=p_id and a.source_kind='private_match_room';
$$;
create function ironclad_private.private_assistance_message_json(p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('id',m.id,'requestId',m.request_id,'sequence',m.sequence,
    'senderKind',m.sender_kind,'body',case when a.content_purged_at is null then m.body else null end,
    'createdAt',m.created_at,'redactedAt',coalesce(m.redacted_at,a.content_purged_at))
  from public.assistance_messages m join public.assistance_requests a on a.id=m.request_id where m.id=p_id;
$$;

create function ironclad_private.private_assistance_access(p_id uuid,p_actor uuid,p_tournament uuid)
returns public.assistance_requests language plpgsql security definer set search_path=pg_catalog as $$
declare a public.assistance_requests%rowtype;
begin
  select * into a from public.assistance_requests where id=p_id and source_kind='private_match_room';
  if not found then raise exception 'Assistance unavailable' using errcode='42501'; end if;
  if coalesce(auth.jwt()->'metadata'->>'role','')='admin' then
    if p_tournament is null or a.tournament_id is distinct from p_tournament then
      raise exception 'Selected tournament does not contain this request' using errcode='42501'; end if;
  elsif a.requester_player_id is distinct from p_actor
    or (p_tournament is not null and a.tournament_id is distinct from p_tournament) then
    raise exception 'Assistance unavailable' using errcode='42501'; end if;
  return a;
end $$;

create function public.get_private_assistance_context(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=ironclad_private.private_assistance_actor(false); v_room public.match_rooms%rowtype;
  a public.assistance_requests%rowtype; r public.registrations%rowtype; v_context jsonb;
begin
  select * into v_room from public.match_rooms where id=p_room_id;
  if not found then raise exception 'Assistance unavailable' using errcode='42501'; end if;
  select * into a from public.assistance_requests where room_id=p_room_id and requester_player_id=v_actor and source_kind='private_match_room';
  if found then
    v_context:=ironclad_private.private_assistance_request_json(a.id)-'id'-'requesterRegistrationId'-'requesterName'-'status'-'version'-'lastSequence'-'createdAt'-'updatedAt'-'resolvedAt'-'contentPurgedAt';
    return jsonb_build_object('newRequestsEnabled',ironclad_private.private_assistance_enabled(),
      'canCreate',false,'room',v_context,'request',ironclad_private.private_assistance_request_json(a.id));
  end if;
  select * into r from public.registrations where id in(v_room.player_one_registration_id,v_room.player_two_registration_id)
    and clerk_user_id=auth.jwt()->>'sub';
  if not found or v_actor is null then raise exception 'Assistance unavailable' using errcode='42501'; end if;
  if r.tournament_id is null or r.tournament_bracket_id is null or not exists(
    select 1 from public.registrations other where other.id in(v_room.player_one_registration_id,v_room.player_two_registration_id)
      and other.id<>r.id and other.tournament_id=r.tournament_id and other.tournament_bracket_id=r.tournament_bracket_id) then
    raise exception 'Assistance context unavailable' using errcode='55000'; end if;
  select jsonb_build_object('roomId',v_room.id,'tournamentId',t.id,'tournamentTitle',t.title,
    'tournamentBracketId',b.id,'divisionName',b.name,'matchId',v_room.match_id,
    'matchReference',case when m.match_number is null then v_room.match_id::text
      else 'Round '||coalesce(br.round_number::text,'?')||' / Match '||m.match_number end,
    'reference',t.title||' / '||b.name||' / '||v_room.match_id::text) into v_context
  from public.tournaments t join public.tournament_brackets b on b.tournament_id=t.id
  left join public.tournament_matches m on m.id=v_room.match_id
  left join public.bracket_rounds br on br.id=m.round_id
  where t.id=r.tournament_id and b.id=r.tournament_bracket_id;
  if v_context is null then raise exception 'Assistance context unavailable' using errcode='55000'; end if;
  return jsonb_build_object('newRequestsEnabled',ironclad_private.private_assistance_enabled(),
    'canCreate',v_room.content_purged_at is null and ironclad_private.private_assistance_enabled(),
    'room',v_context,'request',null);
end $$;

create function ironclad_private.private_assistance_notify(p_request uuid,p_message uuid,p_admin_reply boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare a public.assistance_requests%rowtype; v_title text; v_sub text;
begin
  select * into a from public.assistance_requests where id=p_request;
  select title into v_title from public.tournaments where id=a.tournament_id;
  if p_admin_reply then
    select clerk_user_id into v_sub from public.players where id=a.requester_player_id and account_closed_at is null;
    if v_sub is null then return; end if;
  end if;
  -- Deliberately generic, website-only types: the existing email/push allowlists
  -- do not enroll assistance.* events. No private body or requester name escapes.
  insert into public.notifications(recipient_clerk_user_id,recipient_role,type,title,message,
    tournament_id,tournament_title,match_id,event_key,metadata)
  values(v_sub,case when p_admin_reply then 'player' else 'admin' end,
    case when p_admin_reply then 'assistance.admin_replied' else 'assistance.requester_message' end,
    case when p_admin_reply then 'Admin assistance reply' else 'Private assistance request' end,
    case when p_admin_reply then 'An administrator replied to your private assistance request.' else 'A player sent a private assistance message.' end,
    a.tournament_id,v_title,a.match_id,'private-assistance:'||p_message,
    jsonb_build_object('assistanceRequestId',a.id,'roomId',a.room_id));
end $$;

create function public.open_private_assistance(p_room_id uuid,p_client_message_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=ironclad_private.private_assistance_actor(true); a public.assistance_requests%rowtype;
  m public.assistance_messages%rowtype; v_context jsonb; v_registration uuid; v_enabled boolean;
begin
  perform ironclad_private.private_assistance_body(p_body);
  if p_room_id is null or p_client_message_id is null then raise exception 'Invalid assistance request' using errcode='22023'; end if;
  perform ironclad_private.require_current_account_legal_acceptance();
  -- Actor lock serializes same-account duplicate creation; room lock coordinates
  -- opponents and existing privacy operations without touching competition rows.
  perform 1 from public.match_rooms where id=p_room_id for update;
  select * into a from public.assistance_requests where room_id=p_room_id and requester_player_id=v_actor and source_kind='private_match_room' for update;
  if found then
    if a.creation_client_message_id<>p_client_message_id then
      return jsonb_build_object('request',ironclad_private.private_assistance_request_json(a.id),'message',null,
        'accepted',false,'acceptedClientMessageId',null,'duplicate',false); end if;
    if a.content_purged_at is not null then raise exception 'Assistance content was purged' using errcode='55000'; end if;
    select * into m from public.assistance_messages where request_id=a.id and sequence=1;
    if m.redacted_at is not null then raise exception 'MESSAGE_REDACTED: retained nonce cannot be reused' using errcode='55000'; end if;
    if m.body_sha256 is distinct from sha256(convert_to(p_body,'UTF8')) then
      raise exception 'Client message identity already contains different content' using errcode='23505'; end if;
    return jsonb_build_object('request',ironclad_private.private_assistance_request_json(a.id),
      'message',ironclad_private.private_assistance_message_json(m.id),'accepted',true,
      'acceptedClientMessageId',p_client_message_id,'duplicate',true);
  end if;
  v_context:=public.get_private_assistance_context(p_room_id);
  select value->'enabled'='true'::jsonb into v_enabled from public.platform_settings
    where key='private_assistance_new_requests_enabled' for share;
  if not coalesce(v_enabled,false) then raise exception 'ASSISTANCE_DISABLED' using errcode='P0001'; end if;
  if not (v_context->>'canCreate')::boolean then raise exception 'Assistance unavailable' using errcode='55000'; end if;
  if (select count(*) from public.assistance_requests where requester_player_id=v_actor
    and source_kind='private_match_room' and created_at>clock_timestamp()-interval '1 minute')>=5 then
    raise exception 'ASSISTANCE_RATE_LIMITED' using errcode='P0001'; end if;
  select r.id into v_registration from public.registrations r join public.match_rooms room on r.id in(room.player_one_registration_id,room.player_two_registration_id)
    where room.id=p_room_id and r.clerk_user_id=auth.jwt()->>'sub';
  insert into public.assistance_requests(source_kind,tournament_id,tournament_bracket_id,room_id,match_id,
    requester_registration_id,requester_player_id,creation_client_message_id,last_sequence)
  values('private_match_room',(v_context->'room'->>'tournamentId')::uuid,
    (v_context->'room'->>'tournamentBracketId')::uuid,p_room_id,(v_context->'room'->>'matchId')::uuid,
    v_registration,v_actor,p_client_message_id,1) returning * into a;
  insert into public.assistance_messages(request_id,sequence,sender_kind,author_player_id,actor_clerk_user_id,client_message_id,body,body_sha256)
  values(a.id,1,'requester',v_actor,auth.jwt()->>'sub',p_client_message_id,p_body,sha256(convert_to(p_body,'UTF8'))) returning * into m;
  insert into ironclad_private.match_room_retention_cases(room_id,case_reference,case_kind)
  values(p_room_id,a.id,'support');
  perform ironclad_private.private_assistance_notify(a.id,m.id,false);
  return jsonb_build_object('request',ironclad_private.private_assistance_request_json(a.id),
    'message',ironclad_private.private_assistance_message_json(m.id),'accepted',true,
    'acceptedClientMessageId',p_client_message_id,'duplicate',false);
end $$;

create function public.reply_private_assistance(p_request_id uuid,p_client_message_id uuid,p_body text,p_tournament_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=ironclad_private.private_assistance_actor(true); a public.assistance_requests%rowtype;
  m public.assistance_messages%rowtype; v_admin boolean:=coalesce(auth.jwt()->'metadata'->>'role','')='admin'; v_status text;
begin
  perform ironclad_private.private_assistance_body(p_body);
  if p_client_message_id is null then raise exception 'Invalid client message identity' using errcode='22023'; end if;
  a:=ironclad_private.private_assistance_access(p_request_id,v_actor,p_tournament_id);
  perform ironclad_private.require_current_account_legal_acceptance();
  select * into a from public.assistance_requests where id=a.id for update;
  if a.content_purged_at is not null then raise exception 'Assistance content was purged' using errcode='55000'; end if;
  select * into m from public.assistance_messages where request_id=a.id and author_player_id=v_actor and client_message_id=p_client_message_id;
  if found then
    if m.redacted_at is not null then raise exception 'MESSAGE_REDACTED: retained nonce cannot be reused' using errcode='55000'; end if;
    if m.body_sha256 is distinct from sha256(convert_to(p_body,'UTF8')) then
      raise exception 'Client message identity already contains different content' using errcode='23505'; end if;
    return jsonb_build_object('request',ironclad_private.private_assistance_request_json(a.id),
      'message',ironclad_private.private_assistance_message_json(m.id),'accepted',true,
      'acceptedClientMessageId',p_client_message_id,'duplicate',true);
  end if;
  if (select count(*) from public.assistance_messages where author_player_id=v_actor
    and created_at>clock_timestamp()-interval '1 minute')>=20 then
    raise exception 'ASSISTANCE_RATE_LIMITED' using errcode='P0001'; end if;
  if a.version>=9007199254740991 or a.last_sequence>=9007199254740991 then
    raise exception 'Assistance sequence exhausted' using errcode='54000'; end if;
  v_status:=case when v_admin then 'in_progress' when a.status='resolved' then 'open' else a.status end;
  insert into public.assistance_messages(request_id,sequence,sender_kind,author_player_id,actor_clerk_user_id,client_message_id,body,body_sha256)
  values(a.id,a.last_sequence+1,case when v_admin then 'admin' else 'requester' end,
    v_actor,auth.jwt()->>'sub',p_client_message_id,p_body,sha256(convert_to(p_body,'UTF8'))) returning * into m;
  update public.assistance_requests set status=v_status,resolved_at=null,version=version+1,
    last_sequence=last_sequence+1,updated_at=clock_timestamp(),updated_by_player_id=v_actor where id=a.id;
  update ironclad_private.match_room_retention_cases set closed_at=null,updated_at=clock_timestamp()
    where room_id=a.room_id and case_reference=a.id;
  perform ironclad_private.private_assistance_notify(a.id,m.id,v_admin);
  return jsonb_build_object('request',ironclad_private.private_assistance_request_json(a.id),
    'message',ironclad_private.private_assistance_message_json(m.id),'accepted',true,
    'acceptedClientMessageId',p_client_message_id,'duplicate',false);
end $$;

create function public.read_private_assistance(p_request_id uuid,p_after_sequence bigint default 0,p_limit integer default 50,p_tournament_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=ironclad_private.private_assistance_actor(false); a public.assistance_requests%rowtype;
  v_messages jsonb; v_next bigint;
begin
  if p_after_sequence is null or p_after_sequence not between 0 and 9007199254740991
    or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid history cursor' using errcode='22023'; end if;
  a:=ironclad_private.private_assistance_access(p_request_id,v_actor,p_tournament_id);
  -- Hold the immutable request through this read. Appends/status changes lock
  -- it exclusively; privacy operations take the outer exclusive closure lock.
  -- Header, history and cursor therefore describe one committed thread state.
  select * into a from public.assistance_requests where id=a.id for share;
  with page as (select id,sequence from public.assistance_messages where request_id=a.id
    and sequence>p_after_sequence order by sequence limit p_limit)
  select coalesce(jsonb_agg(ironclad_private.private_assistance_message_json(id) order by sequence),'[]'::jsonb),
    coalesce(max(sequence),p_after_sequence) into v_messages,v_next from page;
  return jsonb_build_object('request',ironclad_private.private_assistance_request_json(a.id),
    'messages',v_messages,'hasMore',exists(select 1 from public.assistance_messages where request_id=a.id and sequence>v_next),
    'nextAfterSequence',v_next,'canReply',a.content_purged_at is null and v_actor is not null,
    'canSetStatus',a.content_purged_at is null and v_actor is not null and coalesce(auth.jwt()->'metadata'->>'role','')='admin');
end $$;

create function public.list_admin_private_assistance(p_tournament_id uuid,p_status text default 'all',p_page integer default 1,p_selected_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=ironclad_private.private_assistance_actor(false); v_result jsonb;
begin
  if coalesce(auth.jwt()->'metadata'->>'role','')<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
  if p_tournament_id is null or p_status is null or p_status not in('all','open','in_progress','resolved')
    or p_page is null or p_page<1 or not exists(select 1 from public.tournaments where id=p_tournament_id) then
    raise exception 'Explicit tournament context required' using errcode='22023'; end if;
  with scoped as materialized(select * from public.assistance_requests where source_kind='private_match_room' and tournament_id=p_tournament_id),
  counts as(select count(*) total,count(*) filter(where status='open') opened,
    count(*) filter(where status='in_progress') progress,count(*) filter(where status='resolved') resolved,
    count(*) filter(where p_status='all' or status=p_status) filtered from scoped),
  paging as(select *,greatest(1,ceil(filtered/25.0)::integer) pages,
    least(p_page,greatest(1,ceil(filtered/25.0)::integer)) page from counts),
  page_rows as(select id,updated_at from scoped where p_status='all' or status=p_status
    order by updated_at desc,id desc limit 25 offset(select(page::bigint-1)*25 from paging))
  select jsonb_build_object('tournamentId',p_tournament_id,'counts',jsonb_build_object('all',p.total,'open',p.opened,'in_progress',p.progress,'resolved',p.resolved),
    'filteredCount',p.filtered,'page',p.page,'pageCount',p.pages,'filter',p_status,
    'newRequestsEnabled',ironclad_private.private_assistance_enabled(),
    'requests',coalesce((select jsonb_agg(ironclad_private.private_assistance_request_json(id) order by updated_at desc,id desc) from page_rows),'[]'::jsonb),
    'selectedRequest',(select ironclad_private.private_assistance_request_json(id) from scoped where id=p_selected_id)) into v_result from paging p;
  return v_result;
end $$;

create function public.set_private_assistance_status(p_tournament_id uuid,p_request_id uuid,p_status text,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=ironclad_private.private_assistance_actor(true); a public.assistance_requests%rowtype;
begin
  if coalesce(auth.jwt()->'metadata'->>'role','')<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
  if p_status is null or p_status not in('open','in_progress','resolved') or p_expected_version is null
    or p_expected_version not between 1 and 9007199254740991 then raise exception 'Invalid assistance status' using errcode='22023'; end if;
  a:=ironclad_private.private_assistance_access(p_request_id,v_actor,p_tournament_id);
  perform ironclad_private.require_current_account_legal_acceptance();
  select * into a from public.assistance_requests where id=a.id for update;
  if a.content_purged_at is not null then raise exception 'Assistance content was purged' using errcode='55000'; end if;
  if a.version<>p_expected_version then raise exception 'Assistance changed' using errcode='40001'; end if;
  if a.status=p_status then return jsonb_build_object('request',ironclad_private.private_assistance_request_json(a.id),'changed',false); end if;
  if a.version>=9007199254740991 then raise exception 'Assistance version exhausted' using errcode='54000'; end if;
  update public.assistance_requests set status=p_status,version=version+1,
    resolved_at=case when p_status='resolved' then clock_timestamp() else null end,
    updated_at=clock_timestamp(),updated_by_player_id=v_actor where id=a.id returning * into a;
  update ironclad_private.match_room_retention_cases set closed_at=a.resolved_at,updated_at=clock_timestamp()
    where room_id=a.room_id and case_reference=a.id;
  return jsonb_build_object('request',ironclad_private.private_assistance_request_json(a.id),'changed',true);
end $$;

-- Already-open old clients cannot create a textless/shared-room help episode.
create or replace function public.request_match_room_assistance(p_room_id uuid,p_expected_request_version bigint default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform ironclad_private.private_assistance_actor(false);
  raise exception 'MESSAGE_REQUIRED: open private assistance and explain the issue' using errcode='55000';
end $$;

create function public.list_legacy_room_assistance(p_tournament_id uuid,p_page integer default 1,p_include_resolved boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid:=ironclad_private.private_assistance_actor(false); v_result jsonb;
begin
  if coalesce(auth.jwt()->'metadata'->>'role','')<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
  if p_tournament_id is null or p_page is null or p_page<1 or p_include_resolved is null
    or not exists(select 1 from public.tournaments where id=p_tournament_id) then
    raise exception 'Explicit tournament context required' using errcode='22023'; end if;
  with scoped as materialized(select a.room_id,a.status,a.request_version,a.requested_at,a.resolved_at,r.match_id
    from public.match_room_assistance a join public.match_rooms r on r.id=a.room_id
    join public.tournament_matches m on m.id=r.match_id
    join public.generated_brackets g on g.id=m.generated_bracket_id
    join public.tournament_brackets b on b.id=g.tournament_bracket_id
    where b.tournament_id=p_tournament_id and (p_include_resolved or a.status='requested')),
  paging as(select count(*) total,greatest(1,ceil(count(*)/25.0)::integer) pages,
    least(p_page,greatest(1,ceil(count(*)/25.0)::integer)) page from scoped),
  page_rows as(select * from scoped order by requested_at,room_id limit 25 offset(select(page::bigint-1)*25 from paging))
  select jsonb_build_object('tournamentId',p_tournament_id,'totalCount',p.total,'page',p.page,'pageCount',p.pages,
    'includeResolved',p_include_resolved,'requests',coalesce((select jsonb_agg(jsonb_build_object(
      'roomId',room_id,'matchId',match_id,'status',status,'requestVersion',request_version,
      'requestedAt',requested_at,'resolvedAt',resolved_at) order by requested_at,room_id) from page_rows),'[]'::jsonb)) into v_result from paging p;
  return v_result;
end $$;

create or replace function public.read_legacy_assistance_queue(p_tournament_id uuid,p_page integer default 1,p_include_resolved boolean default false)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_page is null or p_page<1 or p_include_resolved is null then raise exception 'Invalid assistance page' using errcode='22023'; end if;
  with scoped as materialized(select a.id,a.tournament_id,a.source_notification_id,a.status,a.version,
    a.legacy_resolution_unknown,a.created_at,a.updated_at,n.title,n.message,n.actor_display_name,n.match_id
    from public.assistance_requests a left join public.notifications n on n.id=a.source_notification_id
    where a.source_kind='legacy_notification' and a.tournament_id is not distinct from p_tournament_id
      and(p_include_resolved or a.status<>'resolved')),
  paging as(select count(*) total,greatest(1,ceil(count(*)/25.0)::integer) pages,
    least(p_page,greatest(1,ceil(count(*)/25.0)::integer)) page from scoped),
  page_rows as(select * from scoped order by created_at,id limit 25 offset(select(page::bigint-1)*25 from paging))
  select jsonb_build_object('totalCount',p.total,'page',p.page,'pageCount',p.pages,
    'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from page_rows r),'[]'::jsonb)) into v_result from paging p;
  return v_result;
end $$;

-- Privacy operator APIs use the same trusted server boundary, subject UUID,
-- bounded batches, room locks, formal-case policy and audit as normal chat.
-- No Clerk identity or private message body enters an audit/notification row.
create function public.locate_private_assistance_subject(p_player_id uuid,p_limit integer,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_result jsonb;
begin
  v_actor:=ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_player_id is null or p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'Invalid bounded subject lookup' using errcode='22023'; end if;
  with relevant as materialized(select a.* from public.assistance_requests a where a.source_kind='private_match_room'
    and(a.requester_player_id=p_player_id or exists(select 1 from public.assistance_messages m where m.request_id=a.id and m.author_player_id=p_player_id))),
  limited as(select * from relevant order by id limit p_limit)
  select jsonb_build_object('totalCount',(select count(*) from relevant),'requests',coalesce((select jsonb_agg(
    jsonb_build_object('requestId',a.id,'roomId',a.room_id,'isRequester',a.requester_player_id=p_player_id,
      'status',a.status,'contentPurgedAt',a.content_purged_at,
      'authoredMessageCount',(select count(*) from public.assistance_messages m where m.request_id=a.id and m.author_player_id=p_player_id)) order by a.id) from limited a),'[]'::jsonb)) into v_result;
  return v_result;
end $$;

create function public.export_private_assistance_subject(p_player_id uuid,p_request_id uuid,p_after_sequence bigint,p_limit integer,p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; a public.assistance_requests%rowtype; v_messages jsonb; v_next bigint;
begin
  v_actor:=ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_player_id is null or p_after_sequence is null or p_after_sequence<0 or p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'Invalid bounded export' using errcode='22023'; end if;
  select * into a from public.assistance_requests where id=p_request_id and source_kind='private_match_room';
  if not found or(a.requester_player_id<>p_player_id and not exists(select 1 from public.assistance_messages where request_id=a.id and author_player_id=p_player_id)) then
    raise exception 'Subject scope unavailable' using errcode='42501'; end if;
  perform ironclad_private.lock_match_room_privacy(a.room_id);
  with page as(select id,sequence from public.assistance_messages where request_id=a.id and sequence>p_after_sequence
    and(a.requester_player_id=p_player_id or author_player_id=p_player_id) order by sequence limit p_limit)
  select coalesce(jsonb_agg(ironclad_private.private_assistance_message_json(id) order by sequence),'[]'::jsonb),
    coalesce(max(sequence),p_after_sequence) into v_messages,v_next from page;
  return jsonb_build_object('request',ironclad_private.private_assistance_request_json(a.id),'messages',v_messages,
    'nextAfterSequence',v_next,'hasMore',exists(select 1 from public.assistance_messages where request_id=a.id
      and sequence>v_next and(a.requester_player_id=p_player_id or author_player_id=p_player_id)));
end $$;

create function public.redact_private_assistance_messages(p_player_id uuid,p_request_id uuid,p_message_ids uuid[],p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog set lock_timeout='2s' set statement_timeout='60s' as $$
declare v_actor uuid; a public.assistance_requests%rowtype; s jsonb; n integer;
begin
  v_actor:=ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_player_id is null or p_message_ids is null or cardinality(p_message_ids) not between 1 and 1000 or array_position(p_message_ids,null) is not null then
    raise exception 'Invalid bounded redaction' using errcode='22023'; end if;
  select * into a from public.assistance_requests where id=p_request_id and source_kind='private_match_room';
  if not found then raise exception 'Assistance unavailable' using errcode='42501'; end if;
  perform ironclad_private.lock_match_room_privacy(a.room_id);
  select * into a from public.assistance_requests where id=a.id for update;
  if exists(select 1 from unnest(p_message_ids) scope(id) where not exists(select 1 from public.assistance_messages m
    where m.id=scope.id and m.request_id=a.id and m.author_player_id=p_player_id)) then
    raise exception 'Redaction scope is not authored by subject' using errcode='42501'; end if;
  s:=ironclad_private.match_room_retention_state(a.room_id);
  if (s->>'formalCaseBlocked')::boolean or exists(select 1 from ironclad_private.match_room_retention_holds h
    where h.room_id=a.room_id and h.released_at is null and h.expires_at>now()
      and(h.message_ids is null or h.message_ids && p_message_ids)) then
    raise exception 'Retained case or hold prevents ordinary redaction' using errcode='55000'; end if;
  perform set_config('ironclad.private_assistance_redaction','on',true);
  update public.assistance_messages set body=null,body_sha256=null,redacted_at=clock_timestamp(),actor_clerk_user_id=null
    where id=any(p_message_ids) and request_id=a.id and author_player_id=p_player_id and redacted_at is null;
  get diagnostics n=row_count;
  perform set_config('ironclad.private_assistance_redaction','off',true);
  if n>0 then insert into ironclad_private.match_room_privacy_audit(room_id,operation,actor_player_id,reference_id,counts)
    values(a.room_id,'redact',v_actor,a.id,jsonb_build_object('privateAssistanceMessagesRedacted',n)); end if;
  return jsonb_build_object('redactedCount',n);
end $$;

-- Preserve the deployed implementations exactly. Wrappers add private-message
-- inventory/cleanup; old callers retain the same signatures and return fields.
alter function public.purge_match_room_retention(uuid[],text) rename to purge_match_room_retention_without_private_assistance;
revoke all on function public.purge_match_room_retention_without_private_assistance(uuid[],text) from public,anon,authenticated,service_role;
create function public.purge_match_room_retention(p_room_ids uuid[],p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog set lock_timeout='2s' set statement_timeout='60s' as $$
declare v_actor uuid; v_room uuid; s jsonb; a public.assistance_requests%rowtype;
  n integer; v_deleted integer:=0; v_notices integer:=0; v_result jsonb; v_eligible uuid[]:='{}'::uuid[];
begin
  v_actor:=ironclad_private.match_room_privacy_actor(p_actor_clerk_user_id);
  if p_room_ids is null or cardinality(p_room_ids) not between 1 and 100 or array_position(p_room_ids,null) is not null then
    raise exception 'Select 1 to 100 rooms' using errcode='22023'; end if;
  for v_room in select distinct unnest(p_room_ids) order by 1 loop
    perform ironclad_private.lock_match_room_privacy(v_room);
    s:=ironclad_private.match_room_retention_state(v_room);
    if s->>'blockedReason' is not null then continue; end if;
    if exists(select 1 from public.assistance_requests where room_id=v_room and source_kind='private_match_room'
      and(status<>'resolved' or resolved_at is null or resolved_at>now()-interval '24 months')) then continue; end if;
    -- An existing hold may identify normal-chat OR private message UUIDs. Be
    -- conservative for private cases: retain the entire room until its active
    -- hold is released/expired rather than tombstoning a held conversation.
    if exists(select 1 from public.assistance_requests where room_id=v_room and source_kind='private_match_room')
      and exists(select 1 from ironclad_private.match_room_retention_holds h where h.room_id=v_room
        and h.released_at is null and h.expires_at>now()) then continue; end if;
    v_eligible:=array_append(v_eligible,v_room);
    -- Mark the durable tombstone before deletion; a partial bounded purge cannot
    -- be reopened or reveal remaining bodies, and repeated batches finish safely.
    update public.assistance_requests set content_purged_at=coalesce(content_purged_at,clock_timestamp())
      where room_id=v_room and source_kind='private_match_room';
    perform set_config('ironclad.private_assistance_purge','on',true);
    delete from public.assistance_messages where id in(select m.id from public.assistance_messages m
      join public.assistance_requests req on req.id=m.request_id where req.room_id=v_room and req.source_kind='private_match_room'
      and not exists(select 1 from ironclad_private.match_room_retention_holds h where h.room_id=v_room
        and h.released_at is null and h.expires_at>now() and(h.message_ids is null or m.id=any(h.message_ids)))
      order by m.request_id,m.sequence limit 1000);
    get diagnostics n=row_count; v_deleted:=v_deleted+n;
    perform set_config('ironclad.private_assistance_purge','off',true);
    if n>0 then insert into ironclad_private.match_room_privacy_audit(room_id,operation,actor_player_id,counts)
      values(v_room,'purge',v_actor,jsonb_build_object('privateAssistanceMessagesDeleted',n)); end if;
    delete from public.notifications where id in(select n.id from public.notifications n
      join public.assistance_requests req on n.metadata->>'assistanceRequestId'=req.id::text
      where req.room_id=v_room and req.source_kind='private_match_room' and req.content_purged_at is not null
        and n.type in('assistance.admin_replied','assistance.requester_message') order by n.id limit 1000);
    get diagnostics n=row_count; v_notices:=v_notices+n;
  end loop;
  if cardinality(v_eligible)>0 then
    v_result:=public.purge_match_room_retention_without_private_assistance(v_eligible,p_actor_clerk_user_id);
  else
    v_result:=jsonb_build_object('roomsProcessed',0,'messagesDeleted',0,'readsDeleted',0,
      'episodesDeleted',0,'assistanceDeleted',0,'notificationsDeleted',0);
  end if;
  return v_result||jsonb_build_object('privateAssistanceMessagesDeleted',v_deleted,'privateAssistanceNotificationsDeleted',v_notices);
end $$;

alter function public.close_ironclad_player_account(text) rename to close_ironclad_player_account_without_private_assistance;
revoke all on function public.close_ironclad_player_account_without_private_assistance(text) from public,anon,authenticated,service_role;
create function public.close_ironclad_player_account(p_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_sub text:=nullif(btrim(p_clerk_user_id),''); v_result jsonb;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Account closure requires the trusted server boundary' using errcode='42501'; end if;
  if v_sub is null then raise exception 'Authenticated account identity required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure',0));
  update public.assistance_messages set actor_clerk_user_id=null where actor_clerk_user_id=v_sub;
  v_result:=public.close_ironclad_player_account_without_private_assistance(v_sub);
  return v_result;
end $$;

-- Explicit public entrypoint ACLs. No raw browser table policies are introduced.
alter function ironclad_private.private_assistance_actor(boolean) owner to postgres;
alter function ironclad_private.private_assistance_enabled() owner to postgres;
alter function ironclad_private.private_assistance_body(text) owner to postgres;
alter function ironclad_private.protect_private_assistance_request() owner to postgres;
alter function ironclad_private.protect_private_assistance_message() owner to postgres;
alter function ironclad_private.private_assistance_request_json(uuid) owner to postgres;
alter function ironclad_private.private_assistance_message_json(uuid) owner to postgres;
alter function ironclad_private.private_assistance_access(uuid,uuid,uuid) owner to postgres;
alter function ironclad_private.private_assistance_notify(uuid,uuid,boolean) owner to postgres;
alter function public.get_private_assistance_context(uuid) owner to postgres;
alter function public.open_private_assistance(uuid,uuid,text) owner to postgres;
alter function public.reply_private_assistance(uuid,uuid,text,uuid) owner to postgres;
alter function public.read_private_assistance(uuid,bigint,integer,uuid) owner to postgres;
alter function public.list_admin_private_assistance(uuid,text,integer,uuid) owner to postgres;
alter function public.set_private_assistance_status(uuid,uuid,text,bigint) owner to postgres;
alter function public.list_legacy_room_assistance(uuid,integer,boolean) owner to postgres;
alter function public.locate_private_assistance_subject(uuid,integer,text) owner to postgres;
alter function public.export_private_assistance_subject(uuid,uuid,bigint,integer,text) owner to postgres;
alter function public.redact_private_assistance_messages(uuid,uuid,uuid[],text) owner to postgres;
alter function public.purge_match_room_retention(uuid[],text) owner to postgres;
alter function public.close_ironclad_player_account(text) owner to postgres;
revoke all on function public.get_private_assistance_context(uuid),
  public.open_private_assistance(uuid,uuid,text),public.reply_private_assistance(uuid,uuid,text,uuid),
  public.read_private_assistance(uuid,bigint,integer,uuid),public.list_admin_private_assistance(uuid,text,integer,uuid),
  public.set_private_assistance_status(uuid,uuid,text,bigint),public.list_legacy_room_assistance(uuid,integer,boolean),
  public.request_match_room_assistance(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.get_private_assistance_context(uuid),
  public.open_private_assistance(uuid,uuid,text),public.reply_private_assistance(uuid,uuid,text,uuid),
  public.read_private_assistance(uuid,bigint,integer,uuid),public.list_admin_private_assistance(uuid,text,integer,uuid),
  public.set_private_assistance_status(uuid,uuid,text,bigint),public.list_legacy_room_assistance(uuid,integer,boolean),
  public.request_match_room_assistance(uuid,bigint) to authenticated;
revoke all on function public.locate_private_assistance_subject(uuid,integer,text),
  public.export_private_assistance_subject(uuid,uuid,bigint,integer,text),
  public.redact_private_assistance_messages(uuid,uuid,uuid[],text),
  public.purge_match_room_retention(uuid[],text),public.close_ironclad_player_account(text) from public,anon,authenticated,service_role;
grant execute on function public.locate_private_assistance_subject(uuid,integer,text),
  public.export_private_assistance_subject(uuid,uuid,bigint,integer,text),
  public.redact_private_assistance_messages(uuid,uuid,uuid[],text),
  public.purge_match_room_retention(uuid[],text),public.close_ironclad_player_account(text) to service_role;
revoke all on function ironclad_private.private_assistance_actor(boolean),
  ironclad_private.private_assistance_enabled(),ironclad_private.private_assistance_body(text),
  ironclad_private.protect_private_assistance_request(),ironclad_private.protect_private_assistance_message(),
  ironclad_private.private_assistance_request_json(uuid),ironclad_private.private_assistance_message_json(uuid),
  ironclad_private.private_assistance_access(uuid,uuid,uuid),ironclad_private.private_assistance_notify(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;

commit;
