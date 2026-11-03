-- Patch 2 Phase 4. Additive derived data only; ordinary chat never calls this.
begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

insert into public.platform_settings(key,value)
values('match_chat_translation_enabled','{"enabled":false}'::jsonb)
on conflict(key) do nothing;

create table ironclad_private.match_chat_translations (
  message_id uuid not null references public.match_messages(id) on delete cascade,
  target_language text not null check(target_language in('en','it','zh-CN','ru','es','pt-BR','ko','fr')),
  source_language text not null check(source_language in('en','it','zh-CN','ru','es','pt-BR','ko','fr')),
  model_revision text not null default 'm2m100-1.2b-v1-opencc1',
  source_hash text not null,
  translated_text text check(char_length(translated_text) between 1 and 6000),
  lease_id uuid not null unique default gen_random_uuid(),
  lease_until timestamptz not null,
  requested_by uuid references public.players(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(message_id,target_language,source_language,model_revision)
);
create table ironclad_private.match_chat_translation_usage (
  usage_day date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  attempts integer not null default 0 check(attempts between 0 and 40),
  minute_start timestamptz not null,
  minute_attempts integer not null default 0 check(minute_attempts between 0 and 5),
  primary key(usage_day,player_id)
);
create table ironclad_private.match_chat_translation_daily (
  usage_day date primary key,
  attempts integer not null default 0 check(attempts between 0 and 100),
  input_bytes integer not null default 0 check(input_bytes between 0 and 100000)
);
alter table ironclad_private.match_chat_translations enable row level security;
alter table ironclad_private.match_chat_translation_usage enable row level security;
alter table ironclad_private.match_chat_translation_daily enable row level security;
revoke all on ironclad_private.match_chat_translations,ironclad_private.match_chat_translation_usage,
  ironclad_private.match_chat_translation_daily from public,anon,authenticated,service_role;

create function ironclad_private.invalidate_match_chat_translation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.body is distinct from old.body then
    delete from ironclad_private.match_chat_translations where message_id=old.id;
  end if;
  return new;
end $$;
create trigger invalidate_match_chat_translation after update of body on public.match_messages
for each row execute function ironclad_private.invalidate_match_chat_translation();
revoke all on function ironclad_private.invalidate_match_chat_translation() from public,anon,authenticated,service_role;

-- Always available, even with translation off. Repeat original room membership
-- and active-account checks before projecting originals or cached derivatives.
create function public.read_match_chat_translation_sources(p_room_id uuid,p_message_ids uuid[])
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_sub text; v_room public.match_rooms%rowtype; v_messages jsonb; v_enabled boolean;
begin
  if p_room_id is null or p_message_ids is null or cardinality(p_message_ids)>50
    or array_position(p_message_ids,null) is not null
    or cardinality(p_message_ids)<>(select count(distinct x) from unnest(p_message_ids) x) then
    raise exception 'Invalid translation scope' using errcode='22023';
  end if;
  v_sub:=ironclad_private.match_room_actor();
  v_room:=ironclad_private.match_room_access(p_room_id,v_sub);
  if exists(select 1 from public.match_messages where id=any(p_message_ids) and room_id<>p_room_id) then
    raise exception 'Translation unavailable' using errcode='42501';
  end if;
  select coalesce((value->>'enabled')='true',false) into v_enabled
    from public.platform_settings where key='match_chat_translation_enabled';
  select coalesce(jsonb_agg(jsonb_build_object('messageId',scope.id,
    'original',case when m.sender_kind='player' and v_room.content_purged_at is null
      and not exists(select 1 from ironclad_private.match_room_redactions r where r.message_id=m.id) then m.body end,
    'sourceHash',case when m.sender_kind='player' and v_room.content_purged_at is null
      and not exists(select 1 from ironclad_private.match_room_redactions r where r.message_id=m.id)
      then encode(extensions.digest(m.body,'sha256'),'hex') end) order by scope.id),'[]'::jsonb)
  into v_messages from unnest(p_message_ids) scope(id)
    left join public.match_messages m on m.id=scope.id and m.room_id=p_room_id;
  return jsonb_build_object('enabled',coalesce(v_enabled,false),'messages',v_messages);
end $$;

create function public.reserve_match_chat_translation(p_room_id uuid,p_message_id uuid,
  p_target_language text,p_source_language text,p_expected_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_sub text; v_player uuid; v_room public.match_rooms%rowtype; v_body text;
  v_hash text; v_cache ironclad_private.match_chat_translations%rowtype;
  v_user ironclad_private.match_chat_translation_usage%rowtype;
  v_daily ironclad_private.match_chat_translation_daily%rowtype;
  v_day date:=(clock_timestamp() at time zone 'UTC')::date;
  v_minute timestamptz:=date_trunc('minute',clock_timestamp()); v_lease uuid;
begin
  if p_room_id is null or p_message_id is null or p_expected_hash is null
    or p_target_language is null or p_source_language is null
    or p_target_language not in('en','it','zh-CN','ru','es','pt-BR','ko','fr')
    or p_source_language not in('en','it','zh-CN','ru','es','pt-BR','ko','fr') then
    raise exception 'Invalid translation request' using errcode='22023';
  end if;
  v_sub:=ironclad_private.match_room_actor();
  v_room:=ironclad_private.match_room_access(p_room_id,v_sub);
  select id into strict v_player from public.players where clerk_user_id=v_sub and account_closed_at is null;
  select body into v_body from public.match_messages m where id=p_message_id and room_id=p_room_id
    and sender_kind='player' and not exists(select 1 from ironclad_private.match_room_redactions r where r.message_id=m.id) for share;
  if v_body is null or v_room.content_purged_at is not null then
    return jsonb_build_object('status','redacted');
  end if;
  v_hash:=encode(extensions.digest(v_body,'sha256'),'hex');
  if v_hash<>p_expected_hash then return jsonb_build_object('status','unavailable'); end if;
  if not coalesce((select (value->>'enabled')='true' from public.platform_settings where key='match_chat_translation_enabled'),false) then
    return jsonb_build_object('status','disabled');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ironclad:chat-translation:'||p_message_id::text||':'||p_target_language||':'||p_source_language,0));
  select * into v_cache from ironclad_private.match_chat_translations where message_id=p_message_id
    and target_language=p_target_language and source_language=p_source_language
    and model_revision='m2m100-1.2b-v1-opencc1' for update;
  if found and v_cache.source_hash=v_hash then
    if v_cache.translated_text is not null then
      return jsonb_build_object('status','cached','translatedText',v_cache.translated_text);
    end if;
    if v_cache.lease_until>clock_timestamp() then return jsonb_build_object('status','busy'); end if;
  end if;
  -- Reservations, including uncertain/failed attempts, are not refunded. These
  -- are conservative application caps, NOT a claim to measure provider neurons.
  insert into ironclad_private.match_chat_translation_usage(usage_day,player_id,minute_start)
    values(v_day,v_player,v_minute) on conflict do nothing;
  select * into v_user from ironclad_private.match_chat_translation_usage where usage_day=v_day and player_id=v_player for update;
  if v_user.attempts>=40 or (v_user.minute_start=v_minute and v_user.minute_attempts>=5) then
    return jsonb_build_object('status','rate_limited');
  end if;
  insert into ironclad_private.match_chat_translation_daily(usage_day) values(v_day) on conflict do nothing;
  select * into v_daily from ironclad_private.match_chat_translation_daily where usage_day=v_day for update;
  if v_daily.attempts>=100 or v_daily.input_bytes+octet_length(v_body)>100000 then
    return jsonb_build_object('status','quota_exhausted');
  end if;
  update ironclad_private.match_chat_translation_usage set attempts=attempts+1,minute_start=v_minute,
    minute_attempts=case when minute_start=v_minute then minute_attempts+1 else 1 end where usage_day=v_day and player_id=v_player;
  update ironclad_private.match_chat_translation_daily set attempts=attempts+1,input_bytes=input_bytes+octet_length(v_body) where usage_day=v_day;
  insert into ironclad_private.match_chat_translations(message_id,target_language,source_language,source_hash,lease_until,requested_by)
    values(p_message_id,p_target_language,p_source_language,v_hash,clock_timestamp()+interval '60 seconds',v_player)
    on conflict(message_id,target_language,source_language,model_revision) do update
      set source_hash=excluded.source_hash,translated_text=null,lease_id=gen_random_uuid(),lease_until=excluded.lease_until,
        requested_by=excluded.requested_by,created_at=clock_timestamp()
    returning lease_id into v_lease;
  delete from ironclad_private.match_chat_translation_usage where usage_day<v_day-2;
  delete from ironclad_private.match_chat_translation_daily where usage_day<v_day-31;
  return jsonb_build_object('status','reserved','leaseId',v_lease);
end $$;

-- Only the trusted provider orchestration can complete a lease. Clients cannot
-- poison the shared cache. Privacy takes the same outer closure lock first.
create function public.complete_match_chat_translation(p_lease_id uuid,p_translated_text text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_job ironclad_private.match_chat_translations%rowtype; v_message public.match_messages%rowtype;
begin
  if p_lease_id is null or (p_translated_text is not null and char_length(p_translated_text) not between 1 and 6000) then
    raise exception 'Invalid translation completion' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure',0));
  select * into v_job from ironclad_private.match_chat_translations where lease_id=p_lease_id;
  if not found then return false; end if;
  select * into v_message from public.match_messages where id=v_job.message_id for share;
  if not found then return false; end if;
  select * into v_job from ironclad_private.match_chat_translations where lease_id=p_lease_id for update;
  if not found or v_job.lease_until<clock_timestamp()
    or not exists(select 1 from public.players where id=v_job.requested_by and account_closed_at is null)
    or exists(select 1 from public.match_rooms where id=v_message.room_id and content_purged_at is not null)
    or exists(select 1 from ironclad_private.match_room_redactions where message_id=v_message.id)
    or v_job.source_hash<>encode(extensions.digest(v_message.body,'sha256'),'hex') then return false; end if;
  if not coalesce((select (value->>'enabled')='true' from public.platform_settings where key='match_chat_translation_enabled'),false) then
    delete from ironclad_private.match_chat_translations where lease_id=p_lease_id; return false;
  end if;
  update ironclad_private.match_chat_translations set translated_text=p_translated_text,
    lease_until=clock_timestamp()+interval '60 seconds' where lease_id=p_lease_id;
  return true;
end $$;

alter function public.read_match_chat_translation_sources(uuid,uuid[]) owner to postgres;
alter function public.reserve_match_chat_translation(uuid,uuid,text,text,text) owner to postgres;
alter function public.complete_match_chat_translation(uuid,text) owner to postgres;
alter function ironclad_private.invalidate_match_chat_translation() owner to postgres;
revoke all on function public.read_match_chat_translation_sources(uuid,uuid[]),
  public.reserve_match_chat_translation(uuid,uuid,text,text,text),public.complete_match_chat_translation(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.read_match_chat_translation_sources(uuid,uuid[]),
  public.reserve_match_chat_translation(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.complete_match_chat_translation(uuid,text) to service_role;
comment on table ironclad_private.match_chat_translations is 'Derived chat text, private RPC only; body redaction invalidates, original deletion cascades. No independent retention.';
commit;
