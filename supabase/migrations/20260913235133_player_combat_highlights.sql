begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $preconditions$
begin
  if current_setting('server_version_num')::integer < 150000
    or current_setting('server_encoding') <> 'UTF8' then
    raise exception 'Combat Highlights requires PostgreSQL 15+ and UTF8';
  end if;
end;
$preconditions$;

insert into public.platform_settings(key, value)
values ('player_combat_highlights', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create function public.player_combat_highlights_enabled()
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select public.player_showcase_enabled() and coalesce((
    select value -> 'enabled' = 'true'::jsonb
    from public.platform_settings where key = 'player_combat_highlights'
  ), false);
$$;

create table public.player_combat_highlight_slots (
  player_id uuid not null references public.players(id) on delete cascade,
  slot_number smallint not null check (slot_number between 1 and 3),
  display_order smallint not null check (display_order between 1 and 3),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  current_upload_id uuid,
  pending_upload_id uuid,
  hidden_at timestamptz,
  moderated_by_clerk_user_id text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (player_id, slot_number),
  constraint combat_highlight_display_order_unique unique (player_id, display_order)
    deferrable initially immediate,
  check (current_upload_id is null or current_upload_id is distinct from pending_upload_id)
);

create table ironclad_private.player_combat_highlight_uploads (
  id uuid primary key default gen_random_uuid(),
  player_id uuid,
  slot_number smallint,
  request_id uuid not null,
  title text,
  file_name text,
  content_type text not null check (content_type in ('video/mp4','video/webm')),
  byte_length bigint not null check (byte_length between 1 and 15000000),
  poster_byte_length bigint not null default 0 check (poster_byte_length between 0 and 200000),
  declaration_version text not null check (declaration_version = 'v1'),
  declaration_accepted_at timestamptz not null default clock_timestamp(),
  state text not null default 'reserved'
    check (state in ('reserved','ready','delete_pending','deleted')),
  expires_at timestamptz not null default (clock_timestamp() + interval '15 minutes'),
  verified jsonb,
  created_at timestamptz not null default clock_timestamp(),
  ready_at timestamptz,
  cleanup_after timestamptz,
  cleanup_attempts integer not null default 0 check (cleanup_attempts >= 0),
  cleanup_claim_token uuid,
  cleanup_claim_expires_at timestamptz,
  last_error_code text,
  deleted_at timestamptz,
  unique (player_id, request_id),
  unique (id, player_id, slot_number),
  foreign key (player_id, slot_number)
    references public.player_combat_highlight_slots(player_id, slot_number)
    on delete set null,
  check ((player_id is null) = (slot_number is null)),
  check (title is null or char_length(title) between 1 and 64),
  check (file_name is null or char_length(file_name) between 1 and 255),
  check (state <> 'ready' or (verified is not null and ready_at is not null)),
  check (state not in ('delete_pending','deleted') or cleanup_after is not null)
);
alter table public.player_combat_highlight_slots
  add constraint combat_highlight_current_owned_fk
    foreign key (current_upload_id, player_id, slot_number)
    references ironclad_private.player_combat_highlight_uploads(id, player_id, slot_number),
  add constraint combat_highlight_pending_owned_fk
    foreign key (pending_upload_id, player_id, slot_number)
    references ironclad_private.player_combat_highlight_uploads(id, player_id, slot_number);

create index combat_highlight_owner_created_idx
on ironclad_private.player_combat_highlight_uploads(player_id,created_at desc);
create index combat_highlight_owner_active_idx
on ironclad_private.player_combat_highlight_uploads(player_id) where state<>'deleted';

create index combat_highlight_expiry_idx
on ironclad_private.player_combat_highlight_uploads(expires_at)
where state = 'reserved';
create index combat_highlight_cleanup_idx
on ironclad_private.player_combat_highlight_uploads(cleanup_after)
where state = 'delete_pending';

create table ironclad_private.player_combat_highlight_reports (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references ironclad_private.player_combat_highlight_uploads(id) on delete cascade,
  reporter_player_id uuid references public.players(id) on delete set null,
  reason text not null check (reason in ('inappropriate','harassment','privacy','copyright','other')),
  created_at timestamptz not null default clock_timestamp(),
  unique (upload_id, reporter_player_id)
);

alter table public.player_combat_highlight_slots enable row level security;
alter table public.player_combat_highlight_slots force row level security;
alter table ironclad_private.player_combat_highlight_uploads enable row level security;
alter table ironclad_private.player_combat_highlight_uploads force row level security;
alter table ironclad_private.player_combat_highlight_reports enable row level security;
alter table ironclad_private.player_combat_highlight_reports force row level security;
revoke all on public.player_combat_highlight_slots,
  ironclad_private.player_combat_highlight_uploads,
  ironclad_private.player_combat_highlight_reports from public, anon, authenticated, service_role;

-- As in the corrected Phase A policy, private players columns stay ungranted.
create policy "Players can read their own Combat Highlight slots"
on public.player_combat_highlight_slots for select to authenticated
using (player_id = (select (public.get_my_player_showcase() ->> 'player_id')::uuid));
grant select (player_id, slot_number, display_order, revision, current_upload_id,
  pending_upload_id, hidden_at, created_at, updated_at)
on public.player_combat_highlight_slots to authenticated;

create function ironclad_private.track_combat_highlight_slot()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 0;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    if (new.player_id,new.slot_number) is distinct from (old.player_id,old.slot_number) then
      raise exception 'Combat Highlight slot ownership is immutable' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    if (new.display_order,new.current_upload_id,new.pending_upload_id,new.hidden_at)
      is distinct from (old.display_order,old.current_upload_id,old.pending_upload_id,old.hidden_at) then
      new.revision := old.revision + 1;
      new.updated_at := clock_timestamp();
    else
      new.revision := old.revision;
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger combat_highlight_slot_revision before insert or update
on public.player_combat_highlight_slots for each row
execute function ironclad_private.track_combat_highlight_slot();

create function ironclad_private.protect_combat_highlight_upload()
returns trigger language plpgsql set search_path = pg_catalog
as $$
begin
  if (new.id,new.request_id,new.content_type,new.byte_length,new.poster_byte_length,
      new.declaration_version,new.declaration_accepted_at,new.created_at,new.expires_at)
    is distinct from (old.id,old.request_id,old.content_type,old.byte_length,old.poster_byte_length,
      old.declaration_version,old.declaration_accepted_at,old.created_at,old.expires_at) then
    raise exception 'Upload reservation facts are immutable' using errcode = '42501';
  end if;
  if (new.player_id,new.slot_number) is distinct from (old.player_id,old.slot_number) then
    if new.player_id is not null or new.slot_number is not null then
      raise exception 'Upload ownership is immutable' using errcode = '42501';
    end if;
    -- FK cleanup survives direct parent deletion as well as the closure wrapper.
    if new.state <> 'deleted' then
      new.state := 'delete_pending';
      if old.state <> 'delete_pending' then
        new.cleanup_after := greatest(clock_timestamp(),old.expires_at + interval '1 minute');
        new.cleanup_claim_token := null;
        new.cleanup_claim_expires_at := null;
      end if;
      -- Existing cleanup claims survive closure and identity scrubbing.
    end if;
    new.title := null;
    new.file_name := null;
  end if;
  if (new.title,new.file_name) is distinct from (old.title,old.file_name)
    and not ((new.player_id is null or new.state='deleted') and new.title is null and new.file_name is null) then
    raise exception 'Upload presentation facts are immutable' using errcode = '42501';
  end if;
  if (old.state = 'reserved' and new.state not in ('reserved','ready','delete_pending'))
    or (old.state = 'deleted' and new.state <> 'deleted')
    or (old.state = 'delete_pending' and new.state not in ('delete_pending','deleted'))
    or (old.state = 'ready' and new.state not in ('ready','delete_pending'))
    or (old.verified is not null and new.verified is distinct from old.verified) then
    raise exception 'Upload lifecycle cannot move backwards' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger combat_highlight_upload_immutable before update
on ironclad_private.player_combat_highlight_uploads for each row
execute function ironclad_private.protect_combat_highlight_upload();

create function ironclad_private.combat_highlight_owner(p_lock boolean)
returns uuid language plpgsql security definer set search_path = pg_catalog
as $$
declare v_owner uuid; v_sub text := nullif(btrim(auth.jwt() ->> 'sub'),'');
begin
  if coalesce(auth.role(),'') <> 'authenticated' or v_sub is null then
    raise exception 'Combat Highlights authentication is required' using errcode = '42501';
  end if;
  if p_lock then
    select id into v_owner from public.players
    where clerk_user_id = v_sub and account_closed_at is null for update;
  else
    select id into v_owner from public.players
    where clerk_user_id = v_sub and account_closed_at is null;
  end if;
  return v_owner;
end;
$$;

create function ironclad_private.combat_highlight_state(p_player_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'playerId',p.id,'enabled',public.player_combat_highlights_enabled(),
    'publicProfileEnabled',p.public_profile_enabled,
    'slots',(select jsonb_agg(jsonb_build_object(
      'slotNumber',n,'displayOrder',coalesce(s.display_order,n),
      'revision',coalesce(s.revision,0),'hidden',s.hidden_at is not null,
      'clip',case when u.state='ready' then jsonb_build_object(
        'uploadId',u.id,'title',coalesce(u.title,''),
        'durationMs',(u.verified->>'durationMs')::integer,
        'width',(u.verified->>'width')::integer,'height',(u.verified->>'height')::integer,
        'fps',(u.verified->>'fps')::numeric,'contentType',u.content_type,
        'hasPoster',(u.verified->>'hasPoster')::boolean) else null end,
      'pendingUploadId',s.pending_upload_id
    ) order by coalesce(s.display_order,n))
    from generate_series(1,3) n
    left join public.player_combat_highlight_slots s on s.player_id=p.id and s.slot_number=n
    left join ironclad_private.player_combat_highlight_uploads u
      on u.id=s.current_upload_id and u.player_id=p.id and u.slot_number=s.slot_number)
  ) from public.players p where p.id=p_player_id and p.account_closed_at is null;
$$;

create function ironclad_private.combat_highlight_reply(p_code text,p_player_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object('code',p_code,'state',ironclad_private.combat_highlight_state(p_player_id));
$$;

create function ironclad_private.queue_combat_highlight_cleanup(p_upload_ids uuid[])
returns void language plpgsql security definer set search_path = pg_catalog
as $$
begin
  update ironclad_private.player_combat_highlight_uploads
  set state='delete_pending',
    cleanup_after=greatest(clock_timestamp(),expires_at + interval '1 minute'),
    cleanup_claim_token=null,cleanup_claim_expires_at=null
  where id=any(p_upload_ids) and state not in ('delete_pending','deleted');
end;
$$;

create function public.get_my_player_combat_highlights()
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
begin
  return ironclad_private.combat_highlight_state(ironclad_private.combat_highlight_owner(false));
end;
$$;


create function public.reserve_my_player_combat_highlight(
  p_slot_number smallint,p_expected_revision bigint,p_request_id uuid,
  p_title text,p_file_name text,p_content_type text,p_byte_length bigint,
  p_poster_byte_length bigint,p_declaration_version text,p_declaration_accepted boolean
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_owner uuid := ironclad_private.combat_highlight_owner(true);
  v_slot public.player_combat_highlight_slots%rowtype;
  v_upload ironclad_private.player_combat_highlight_uploads%rowtype;
  v_title text; v_file text; v_id uuid;
begin
  if v_owner is null then return ironclad_private.combat_highlight_reply('profile-required',null); end if;
  if p_slot_number is null or p_slot_number not between 1 and 3
    or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991
    or p_request_id is null or p_content_type is null or p_content_type not in ('video/mp4','video/webm')
    or p_byte_length is null or p_byte_length not between 1 and 15000000
    or p_poster_byte_length is null or p_poster_byte_length not between 0 and 200000
    or p_declaration_version is distinct from 'v1' or p_declaration_accepted is distinct from true then
    return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
  end if;
  begin
    v_title := ironclad_private.normalize_player_showcase_thought(p_title);
  exception when invalid_parameter_value then
    return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
  end;
  v_file := nullif(btrim(normalize(p_file_name,NFC)),'');
  if char_length(v_title)>64 or v_file is null or char_length(v_file)>255
    or v_file ~ '[[:cntrl:]]' or position('/' in v_file)>0 or position(chr(92) in v_file)>0 then
    return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
  end if;
  if not public.player_combat_highlights_enabled() then
    return ironclad_private.combat_highlight_reply('feature-disabled',v_owner);
  end if;
  if not ironclad_private.player_showcase_has_current_legal_acceptance(auth.jwt()->>'sub') then
    return ironclad_private.combat_highlight_reply('legal-required',v_owner);
  end if;
  select * into v_upload from ironclad_private.player_combat_highlight_uploads
  where player_id=v_owner and request_id=p_request_id;
  if found then
    if (v_upload.slot_number,v_upload.title,v_upload.file_name,v_upload.content_type,
        v_upload.byte_length,v_upload.poster_byte_length)
      is distinct from (p_slot_number,v_title,v_file,p_content_type,p_byte_length,p_poster_byte_length) then
      return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
    end if;
    if v_upload.state='ready' or (v_upload.state='reserved' and v_upload.expires_at>clock_timestamp()) then
      return ironclad_private.combat_highlight_reply('saved',v_owner) ||
        jsonb_build_object('uploadId',v_upload.id);
    end if;
    return ironclad_private.combat_highlight_reply('upload-expired',v_owner);
  end if;
  -- Upload IDs also bind pre-signed grants. Never reuse another reservation's ID.
  if exists(select 1 from ironclad_private.player_combat_highlight_uploads where id=p_request_id) then
    return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
  end if;
  -- Parent locking makes both abuse limits atomic across simultaneous requests.
  -- Deleted attempts retain owner association only until account closure so the
  -- hourly limit cannot be bypassed by rapid successful provider cleanup.
  if (select count(*) from ironclad_private.player_combat_highlight_uploads
      where player_id=v_owner and created_at>clock_timestamp()-interval '1 hour')>=12
    or (select count(*) from ironclad_private.player_combat_highlight_uploads
      where player_id=v_owner and state<>'deleted')>=9 then
    return ironclad_private.combat_highlight_reply('upload-limit',v_owner);
  end if;
  select * into v_slot from public.player_combat_highlight_slots
  where player_id=v_owner and slot_number=p_slot_number for update;
  if coalesce(v_slot.revision,0)<>p_expected_revision then
    return ironclad_private.combat_highlight_reply('conflict',v_owner);
  end if;
  if v_slot.pending_upload_id is not null then
    select * into v_upload from ironclad_private.player_combat_highlight_uploads
    where id=v_slot.pending_upload_id for update;
    if v_upload.state='reserved' and v_upload.expires_at>clock_timestamp() then
      return ironclad_private.combat_highlight_reply('upload-pending',v_owner);
    end if;
    perform ironclad_private.queue_combat_highlight_cleanup(array[v_slot.pending_upload_id]);
  end if;
  -- Allocate the three fixed identities together. Reorder never changes slot_number.
  insert into public.player_combat_highlight_slots(player_id,slot_number,display_order)
  select v_owner,n,n from generate_series(1,3) n
  on conflict (player_id,slot_number) do nothing;
  insert into ironclad_private.player_combat_highlight_uploads(
    id,player_id,slot_number,request_id,title,file_name,content_type,byte_length,
    poster_byte_length,declaration_version
  ) values (p_request_id,v_owner,p_slot_number,p_request_id,v_title,v_file,p_content_type,p_byte_length,
    p_poster_byte_length,'v1') on conflict (id) do nothing returning id into v_id;
  if v_id is null then return ironclad_private.combat_highlight_reply('invalid-input',v_owner); end if;
  update public.player_combat_highlight_slots set pending_upload_id=v_id
  where player_id=v_owner and slot_number=p_slot_number;
  return ironclad_private.combat_highlight_reply('saved',v_owner)||jsonb_build_object('uploadId',v_id);
end;
$$;

create function public.get_my_player_combat_highlight_upload(p_upload_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_owner uuid := ironclad_private.combat_highlight_owner(false); v_result jsonb;
begin
  select jsonb_build_object('uploadId',u.id,'title',coalesce(u.title,''),'fileName',u.file_name,
    'contentType',u.content_type,'byteLength',u.byte_length,'posterByteLength',u.poster_byte_length,
    'slotNumber',u.slot_number,'expiresAt',u.expires_at,'declarationVersion',u.declaration_version,
    'declarationAcceptedAt',u.declaration_accepted_at)
  into v_result
  from ironclad_private.player_combat_highlight_uploads u
  join public.player_combat_highlight_slots s on s.player_id=u.player_id
    and s.slot_number=u.slot_number and s.pending_upload_id=u.id
  where u.id=p_upload_id and u.player_id=v_owner and u.state='reserved'
    and u.expires_at>clock_timestamp();
  return v_result;
end;
$$;

create function public.can_read_public_player_combat_highlight(p_upload_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select public.player_combat_highlights_enabled() and exists (
    select 1 from ironclad_private.player_combat_highlight_uploads u
    join public.player_combat_highlight_slots s on s.player_id=u.player_id
      and s.slot_number=u.slot_number and s.current_upload_id=u.id
    join public.players p on p.id=s.player_id
    where u.id=p_upload_id and u.state='ready' and u.verified is not null
      and s.hidden_at is null and p.account_closed_at is null
      and p.public_profile_enabled is true
  );
$$;

create function public.can_access_my_player_combat_highlight(p_upload_id uuid,p_purpose text)
returns boolean language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_owner uuid := ironclad_private.combat_highlight_owner(false);
  v_upload ironclad_private.player_combat_highlight_uploads%rowtype;
  v_slot public.player_combat_highlight_slots%rowtype;
begin
  if v_owner is null or p_purpose is null or p_purpose not in ('read','upload') then return false; end if;
  select * into v_upload from ironclad_private.player_combat_highlight_uploads
  where id=p_upload_id and player_id=v_owner;
  if not found then return false; end if;
  select * into v_slot from public.player_combat_highlight_slots
  where player_id=v_owner and slot_number=v_upload.slot_number;
  if p_purpose='read' then
    return coalesce(v_upload.state='ready' and v_upload.verified is not null
      and (v_slot.current_upload_id=p_upload_id or v_slot.pending_upload_id=p_upload_id),false);
  end if;
  return coalesce(v_slot.pending_upload_id=p_upload_id and v_upload.state='reserved'
    and v_upload.expires_at>clock_timestamp() and public.player_combat_highlights_enabled()
    and ironclad_private.player_showcase_has_current_legal_acceptance(auth.jwt()->>'sub'),false);
end;
$$;

create function public.get_public_player_combat_highlights(p_player_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slotNumber',s.slot_number,'displayOrder',s.display_order,'uploadId',u.id,
    'title',coalesce(u.title,''),'durationMs',(u.verified->>'durationMs')::integer,
    'width',(u.verified->>'width')::integer,'height',(u.verified->>'height')::integer,
    'fps',(u.verified->>'fps')::numeric,'contentType',u.content_type,
    'hasPoster',(u.verified->>'hasPoster')::boolean
  ) order by s.display_order),'[]'::jsonb)
  from public.player_combat_highlight_slots s
  join ironclad_private.player_combat_highlight_uploads u
    on u.id=s.current_upload_id and u.player_id=s.player_id and u.slot_number=s.slot_number
  where s.player_id=p_player_id and public.can_read_public_player_combat_highlight(u.id);
$$;

create function public.complete_player_combat_highlight_upload(p_upload_id uuid,p_verified jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_upload ironclad_private.player_combat_highlight_uploads%rowtype;
  v_slot public.player_combat_highlight_slots%rowtype;
  v_owner uuid; v_sub text; v_valid boolean := false;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Trusted media verification is required' using errcode='42501';
  end if;
  select * into v_upload from ironclad_private.player_combat_highlight_uploads where id=p_upload_id;
  if not found then return ironclad_private.combat_highlight_reply('invalid-input',null); end if;
  select id,clerk_user_id into v_owner,v_sub from public.players
  where id=v_upload.player_id and account_closed_at is null for update;
  if v_owner is null then
    perform ironclad_private.queue_combat_highlight_cleanup(array[p_upload_id]);
    return ironclad_private.combat_highlight_reply('profile-required',null);
  end if;
  select * into v_slot from public.player_combat_highlight_slots
  where player_id=v_owner and slot_number=v_upload.slot_number for update;
  select * into v_upload from ironclad_private.player_combat_highlight_uploads
  where id=p_upload_id for update;
  if v_upload.state='ready' and v_slot.current_upload_id=p_upload_id then
    if v_upload.verified=p_verified then
      return ironclad_private.combat_highlight_reply('saved',v_owner);
    end if;
    return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
  end if;
  if v_slot.pending_upload_id is distinct from p_upload_id or v_upload.state<>'reserved' then
    perform ironclad_private.queue_combat_highlight_cleanup(array[p_upload_id]);
    return ironclad_private.combat_highlight_reply('conflict',v_owner);
  end if;
  if v_upload.expires_at<=clock_timestamp() then
    update public.player_combat_highlight_slots set pending_upload_id=null
    where player_id=v_owner and slot_number=v_slot.slot_number;
    perform ironclad_private.queue_combat_highlight_cleanup(array[p_upload_id]);
    return ironclad_private.combat_highlight_reply('upload-expired',v_owner);
  end if;
  if not public.player_combat_highlights_enabled() then
    return ironclad_private.combat_highlight_reply('feature-disabled',v_owner);
  end if;
  if not ironclad_private.player_showcase_has_current_legal_acceptance(v_sub) then
    return ironclad_private.combat_highlight_reply('legal-required',v_owner);
  end if;
  v_valid := ironclad_private.valid_combat_highlight_verified(
    p_verified,v_upload.content_type,v_upload.byte_length,v_upload.poster_byte_length);
  if v_valid is distinct from true then
    return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
  end if;
  update ironclad_private.player_combat_highlight_uploads
  set state='ready',verified=p_verified,ready_at=clock_timestamp() where id=p_upload_id;
  update public.player_combat_highlight_slots
  set current_upload_id=p_upload_id,pending_upload_id=null
  where player_id=v_owner and slot_number=v_slot.slot_number;
  perform ironclad_private.queue_combat_highlight_cleanup(array[v_slot.current_upload_id]);
  return ironclad_private.combat_highlight_reply('saved',v_owner);
end;
$$;


create function public.clear_my_player_combat_highlight(p_slot_number smallint,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_owner uuid := ironclad_private.combat_highlight_owner(true);
  v_slot public.player_combat_highlight_slots%rowtype;
begin
  if v_owner is null then return ironclad_private.combat_highlight_reply('profile-required',null); end if;
  if p_slot_number is null or p_slot_number not between 1 and 3
    or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991 then
    return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
  end if;
  select * into v_slot from public.player_combat_highlight_slots
  where player_id=v_owner and slot_number=p_slot_number for update;
  if coalesce(v_slot.revision,0)<>p_expected_revision then
    return ironclad_private.combat_highlight_reply('conflict',v_owner);
  end if;
  -- No flag/legal check: removing media remains possible during outages or holds.
  update public.player_combat_highlight_slots set current_upload_id=null,pending_upload_id=null
  where player_id=v_owner and slot_number=p_slot_number;
  perform ironclad_private.queue_combat_highlight_cleanup(array[v_slot.current_upload_id,v_slot.pending_upload_id]);
  return ironclad_private.combat_highlight_reply('saved',v_owner);
end;
$$;

create function public.cancel_my_player_combat_highlight_upload(p_upload_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_owner uuid := ironclad_private.combat_highlight_owner(true);
  v_slot public.player_combat_highlight_slots%rowtype;
begin
  if v_owner is null then return ironclad_private.combat_highlight_reply('profile-required',null); end if;
  if p_upload_id is null or p_expected_revision is null
    or p_expected_revision not between 0 and 9007199254740991 then
    return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
  end if;
  select * into v_slot from public.player_combat_highlight_slots
  where player_id=v_owner and pending_upload_id=p_upload_id for update;
  if not found then return ironclad_private.combat_highlight_reply('invalid-input',v_owner); end if;
  if v_slot.revision<>p_expected_revision then
    return ironclad_private.combat_highlight_reply('conflict',v_owner);
  end if;
  update public.player_combat_highlight_slots set pending_upload_id=null
  where player_id=v_owner and slot_number=v_slot.slot_number;
  perform ironclad_private.queue_combat_highlight_cleanup(array[p_upload_id]);
  return ironclad_private.combat_highlight_reply('saved',v_owner);
end;
$$;

create function public.reorder_my_player_combat_highlights(p_slot_numbers smallint[],p_expected_revisions bigint[])
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_owner uuid := ironclad_private.combat_highlight_owner(true); v_index integer; v_revision bigint;
begin
  if v_owner is null then return ironclad_private.combat_highlight_reply('profile-required',null); end if;
  if array_ndims(p_slot_numbers) is distinct from 1 or array_lower(p_slot_numbers,1) is distinct from 1
    or cardinality(p_slot_numbers) is distinct from 3
    or (select array_agg(n order by n) from unnest(p_slot_numbers) n) is distinct from array[1,2,3]::smallint[]
    or array_ndims(p_expected_revisions) is distinct from 1
    or array_lower(p_expected_revisions,1) is distinct from 1
    or cardinality(p_expected_revisions) is distinct from 3
    or exists(select 1 from unnest(p_expected_revisions) r where r is null or r not between 0 and 9007199254740991) then
    return ironclad_private.combat_highlight_reply('invalid-input',v_owner);
  end if;
  perform 1 from public.player_combat_highlight_slots
  where player_id=v_owner order by slot_number for update;
  for v_index in 1..3 loop
    select revision into v_revision from public.player_combat_highlight_slots
    where player_id=v_owner and slot_number=p_slot_numbers[v_index];
    if coalesce(v_revision,0)<>p_expected_revisions[v_index] then
      return ironclad_private.combat_highlight_reply('conflict',v_owner);
    end if;
  end loop;
  insert into public.player_combat_highlight_slots(player_id,slot_number,display_order)
  select v_owner,n,n from generate_series(1,3) n on conflict (player_id,slot_number) do nothing;
  set constraints public.combat_highlight_display_order_unique deferred;
  update public.player_combat_highlight_slots
  set display_order=array_position(p_slot_numbers,slot_number)
  where player_id=v_owner;
  set constraints public.combat_highlight_display_order_unique immediate;
  return ironclad_private.combat_highlight_reply('saved',v_owner);
end;
$$;

create function public.moderate_player_combat_highlight(
  p_player_id uuid,p_slot_number smallint,p_hidden boolean,
  p_actor_clerk_user_id text,p_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_owner uuid; v_slot public.player_combat_highlight_slots%rowtype;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Trusted moderation is required' using errcode='42501';
  end if;
  if p_player_id is null or p_slot_number is null or p_slot_number not between 1 and 3
    or p_hidden is null or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991
    or nullif(btrim(p_actor_clerk_user_id),'') is null or char_length(p_actor_clerk_user_id)>255
    or p_actor_clerk_user_id ~ '[[:cntrl:]]' then
    return ironclad_private.combat_highlight_reply('invalid-input',null);
  end if;
  select id into v_owner from public.players
  where id=p_player_id and account_closed_at is null for update;
  if v_owner is null then return ironclad_private.combat_highlight_reply('profile-required',null); end if;
  select * into v_slot from public.player_combat_highlight_slots
  where player_id=v_owner and slot_number=p_slot_number for update;
  if not found then return ironclad_private.combat_highlight_reply('invalid-input',v_owner); end if;
  if v_slot.revision<>p_expected_revision then return ironclad_private.combat_highlight_reply('conflict',v_owner); end if;
  if (v_slot.hidden_at is not null) is distinct from p_hidden then
    update public.player_combat_highlight_slots
    set hidden_at=case when p_hidden then clock_timestamp() else null end,
      moderated_by_clerk_user_id=p_actor_clerk_user_id
    where player_id=v_owner and slot_number=p_slot_number;
  end if;
  return ironclad_private.combat_highlight_reply('saved',v_owner);
end;
$$;

create function public.report_player_combat_highlight(p_upload_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_owner uuid := ironclad_private.combat_highlight_owner(true);
begin
  if v_owner is null then return jsonb_build_object('code','profile-required'); end if;
  if p_upload_id is null or p_reason is null
    or p_reason not in ('inappropriate','harassment','privacy','copyright','other') then
    return jsonb_build_object('code','invalid-input');
  end if;
  if exists(select 1 from ironclad_private.player_combat_highlight_reports
    where upload_id=p_upload_id and reporter_player_id=v_owner) then
    return jsonb_build_object('code','reported');
  end if;
  if not public.can_read_public_player_combat_highlight(p_upload_id) then
    return jsonb_build_object('code','invalid-input');
  end if;
  insert into ironclad_private.player_combat_highlight_reports(upload_id,reporter_player_id,reason)
  values (p_upload_id,v_owner,p_reason)
  on conflict (upload_id,reporter_player_id) do nothing;
  return jsonb_build_object('code','reported');
end;
$$;

create function public.claim_player_combat_highlight_cleanup(p_limit integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_owner uuid; v_expired uuid[]; v_claims jsonb;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Trusted cleanup is required' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Cleanup claim limit must be between 1 and 50' using errcode='22023';
  end if;
  -- Expiration follows the same parent -> slots -> uploads lock order as owners.
  -- SKIP LOCKED avoids waiting while holding any earlier owner in this batch.
  for v_owner in
    select p.id from public.players p where exists (
      select 1 from ironclad_private.player_combat_highlight_uploads u
      where u.player_id=p.id and u.state='reserved' and u.expires_at<=clock_timestamp()
    ) order by p.id limit p_limit for update of p skip locked
  loop
    perform 1 from public.player_combat_highlight_slots
    where player_id=v_owner order by slot_number for update;
    select array_agg(id) into v_expired from ironclad_private.player_combat_highlight_uploads
    where player_id=v_owner and state='reserved' and expires_at<=clock_timestamp();
    update public.player_combat_highlight_slots set pending_upload_id=null
    where player_id=v_owner and pending_upload_id=any(v_expired);
    perform ironclad_private.queue_combat_highlight_cleanup(v_expired);
  end loop;
  -- Recovery for parent deletion through any database-enforced cascade path.
  update ironclad_private.player_combat_highlight_uploads
  set state='delete_pending',cleanup_after=greatest(clock_timestamp(),expires_at+interval '1 minute')
  where player_id is null and state not in ('delete_pending','deleted');
  with candidates as (
    select id from ironclad_private.player_combat_highlight_uploads
    where state='delete_pending' and cleanup_after<=clock_timestamp()
      and (cleanup_claim_expires_at is null or cleanup_claim_expires_at<=clock_timestamp())
    order by cleanup_after,id limit p_limit for update skip locked
  ), claimed as (
    update ironclad_private.player_combat_highlight_uploads u
    set cleanup_claim_token=gen_random_uuid(),cleanup_claim_expires_at=clock_timestamp()+interval '5 minutes',
      cleanup_attempts=cleanup_attempts+1
    from candidates c where u.id=c.id
    returning u.id,u.cleanup_claim_token
  )
  select coalesce(jsonb_agg(jsonb_build_object('uploadId',id,'claimToken',cleanup_claim_token)),'[]'::jsonb)
  into v_claims from claimed;
  return v_claims;
end;
$$;

create function public.finish_player_combat_highlight_cleanup(
  p_upload_id uuid,p_claim_token uuid,p_deleted boolean,p_error_code text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_upload ironclad_private.player_combat_highlight_uploads%rowtype;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Trusted cleanup is required' using errcode='42501';
  end if;
  if p_upload_id is null or p_claim_token is null or p_deleted is null
    or (p_error_code is not null and p_error_code !~ '^[a-z0-9_-]{1,64}$') then
    return jsonb_build_object('code','invalid-input');
  end if;
  select * into v_upload from ironclad_private.player_combat_highlight_uploads
  where id=p_upload_id for update;
  if not found or v_upload.state<>'delete_pending'
    or v_upload.cleanup_claim_token is distinct from p_claim_token
    or v_upload.cleanup_claim_expires_at<=clock_timestamp() then
    return jsonb_build_object('code','claim-lost');
  end if;
  if p_deleted then
    update ironclad_private.player_combat_highlight_uploads
    set state='deleted',deleted_at=clock_timestamp(),
      title=null,file_name=null,cleanup_claim_token=null,cleanup_claim_expires_at=null,last_error_code=null
    where id=p_upload_id;
  else
    update ironclad_private.player_combat_highlight_uploads
    set cleanup_after=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(cleanup_attempts,7)))::integer),
      cleanup_claim_token=null,cleanup_claim_expires_at=null,
      last_error_code=coalesce(p_error_code,'delete-failed')
    where id=p_upload_id;
  end if;
  return jsonb_build_object('code','saved');
end;
$$;

-- Preserve the entire Phase A -> announcement -> push -> historical closure chain.
alter function public.close_ironclad_player_account(text)
  rename to close_ironclad_player_account_without_combat_highlights;
revoke all on function public.close_ironclad_player_account_without_combat_highlights(text)
  from public,anon,authenticated,service_role;

create function public.close_ironclad_player_account(p_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_sub text := nullif(btrim(p_clerk_user_id),''); v_owner uuid;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Account closure requires the trusted server boundary' using errcode='42501';
  end if;
  if v_sub is null then raise exception 'Authenticated account identity is required' using errcode='22023'; end if;
  -- Serializes cross-player moderation-attribution scrubbing during two closures.
  perform pg_advisory_xact_lock(hashtextextended('ironclad:combat-highlight-closure',0));
  perform pg_advisory_xact_lock(hashtextextended('ironclad:announcement-account:'||v_sub,0));
  select id into v_owner from public.players where clerk_user_id=v_sub for update;
  -- Detach both composite references before the slot FK nulls upload ownership.
  update public.player_combat_highlight_slots set current_upload_id=null,pending_upload_id=null
  where player_id=v_owner;
  delete from public.player_combat_highlight_slots where player_id=v_owner;
  -- Slot FK SET NULL invokes the immutable-upload trigger, retaining cleanup work
  -- while removing the owner association and private presentation text.
  update public.player_combat_highlight_slots set moderated_by_clerk_user_id=null
  where moderated_by_clerk_user_id=v_sub;
  update ironclad_private.player_combat_highlight_reports set reporter_player_id=null
  where reporter_player_id=v_owner;
  return public.close_ironclad_player_account_without_combat_highlights(v_sub);
end;
$$;


create function ironclad_private.valid_combat_highlight_verified(
  p_verified jsonb,p_content_type text,p_byte_length bigint,p_poster_byte_length bigint
)
returns boolean language plpgsql immutable set search_path = pg_catalog
as $$
declare v_valid boolean := false;
begin
  begin
    v_valid := jsonb_typeof(p_verified)='object'
      and p_verified ?& array['codec','audioCodec','durationMs','width','height','fps',
        'byteLength','sha256','etag','hasPoster']
      and not exists(select 1 from jsonb_object_keys(p_verified) k
        where k<>all(array['codec','audioCodec','durationMs','width','height','fps',
          'byteLength','sha256','etag','hasPoster']))
      and jsonb_typeof(p_verified->'codec')='string'
      and (p_verified->'audioCodec'='null'::jsonb or jsonb_typeof(p_verified->'audioCodec')='string')
      and jsonb_typeof(p_verified->'durationMs')='number'
      and (p_verified->>'durationMs')::integer between 1 and 15000
      and jsonb_typeof(p_verified->'width')='number'
      and (p_verified->>'width')::integer between 1 and 1920
      and jsonb_typeof(p_verified->'height')='number'
      and (p_verified->>'height')::integer between 1 and 1080
      and jsonb_typeof(p_verified->'fps')='number' and (p_verified->>'fps')::numeric>0
      and (p_verified->>'fps')::numeric<=60
      and jsonb_typeof(p_verified->'byteLength')='number'
      and (p_verified->>'byteLength')::bigint=p_byte_length
      and jsonb_typeof(p_verified->'sha256')='string'
      and (p_verified->>'sha256') ~ '^[0-9a-f]{64}$'
      and jsonb_typeof(p_verified->'etag')='string'
      and char_length(p_verified->>'etag') between 1 and 128
      and not (p_verified->>'etag') ~ '[[:cntrl:]]'
      and jsonb_typeof(p_verified->'hasPoster')='boolean'
      and (not (p_verified->>'hasPoster')::boolean or p_poster_byte_length>0)
      and ((p_content_type='video/mp4' and p_verified->>'codec'='avc'
        and (p_verified->'audioCodec'='null'::jsonb or p_verified->>'audioCodec'='aac'))
        or (p_content_type='video/webm' and p_verified->>'codec' in ('vp8','vp9')
        and (p_verified->'audioCodec'='null'::jsonb or p_verified->>'audioCodec' in ('opus','vorbis'))));
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    v_valid := false;
  end;
  return coalesce(v_valid,false);
end;
$$;
alter table ironclad_private.player_combat_highlight_uploads
  add constraint combat_highlight_verified_metadata_check check (
    verified is null or ironclad_private.valid_combat_highlight_verified(
      verified,content_type,byte_length,poster_byte_length)
  );

-- Explicitly scoped RPC execution; private tables and helper functions stay private.
alter function public.player_combat_highlights_enabled() owner to postgres;
revoke all on function public.player_combat_highlights_enabled() from public,anon,authenticated,service_role;
grant execute on function public.player_combat_highlights_enabled() to anon,authenticated,service_role;
alter function ironclad_private.track_combat_highlight_slot() owner to postgres;
revoke all on function ironclad_private.track_combat_highlight_slot() from public,anon,authenticated,service_role;
alter function ironclad_private.protect_combat_highlight_upload() owner to postgres;
revoke all on function ironclad_private.protect_combat_highlight_upload() from public,anon,authenticated,service_role;
alter function ironclad_private.combat_highlight_owner(boolean) owner to postgres;
revoke all on function ironclad_private.combat_highlight_owner(boolean) from public,anon,authenticated,service_role;
alter function ironclad_private.combat_highlight_state(uuid) owner to postgres;
revoke all on function ironclad_private.combat_highlight_state(uuid) from public,anon,authenticated,service_role;
alter function ironclad_private.combat_highlight_reply(text,uuid) owner to postgres;
revoke all on function ironclad_private.combat_highlight_reply(text,uuid) from public,anon,authenticated,service_role;
alter function ironclad_private.queue_combat_highlight_cleanup(uuid[]) owner to postgres;
revoke all on function ironclad_private.queue_combat_highlight_cleanup(uuid[]) from public,anon,authenticated,service_role;
alter function public.get_my_player_combat_highlights() owner to postgres;
revoke all on function public.get_my_player_combat_highlights() from public,anon,authenticated,service_role;
grant execute on function public.get_my_player_combat_highlights() to authenticated;
alter function public.reserve_my_player_combat_highlight(smallint,bigint,uuid,text,text,text,bigint,bigint,text,boolean) owner to postgres;
revoke all on function public.reserve_my_player_combat_highlight(smallint,bigint,uuid,text,text,text,bigint,bigint,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.reserve_my_player_combat_highlight(smallint,bigint,uuid,text,text,text,bigint,bigint,text,boolean) to authenticated;
alter function public.get_my_player_combat_highlight_upload(uuid) owner to postgres;
revoke all on function public.get_my_player_combat_highlight_upload(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_player_combat_highlight_upload(uuid) to authenticated;
alter function public.can_read_public_player_combat_highlight(uuid) owner to postgres;
revoke all on function public.can_read_public_player_combat_highlight(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_read_public_player_combat_highlight(uuid) to anon,authenticated,service_role;
alter function public.can_access_my_player_combat_highlight(uuid,text) owner to postgres;
revoke all on function public.can_access_my_player_combat_highlight(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.can_access_my_player_combat_highlight(uuid,text) to authenticated;
alter function public.get_public_player_combat_highlights(uuid) owner to postgres;
revoke all on function public.get_public_player_combat_highlights(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_public_player_combat_highlights(uuid) to anon,authenticated,service_role;
alter function public.complete_player_combat_highlight_upload(uuid,jsonb) owner to postgres;
revoke all on function public.complete_player_combat_highlight_upload(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.complete_player_combat_highlight_upload(uuid,jsonb) to service_role;
alter function public.clear_my_player_combat_highlight(smallint,bigint) owner to postgres;
revoke all on function public.clear_my_player_combat_highlight(smallint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.clear_my_player_combat_highlight(smallint,bigint) to authenticated;
alter function public.cancel_my_player_combat_highlight_upload(uuid,bigint) owner to postgres;
revoke all on function public.cancel_my_player_combat_highlight_upload(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.cancel_my_player_combat_highlight_upload(uuid,bigint) to authenticated;
alter function public.reorder_my_player_combat_highlights(smallint[],bigint[]) owner to postgres;
revoke all on function public.reorder_my_player_combat_highlights(smallint[],bigint[]) from public,anon,authenticated,service_role;
grant execute on function public.reorder_my_player_combat_highlights(smallint[],bigint[]) to authenticated;
alter function public.moderate_player_combat_highlight(uuid,smallint,boolean,text,bigint) owner to postgres;
revoke all on function public.moderate_player_combat_highlight(uuid,smallint,boolean,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.moderate_player_combat_highlight(uuid,smallint,boolean,text,bigint) to service_role;
alter function public.report_player_combat_highlight(uuid,text) owner to postgres;
revoke all on function public.report_player_combat_highlight(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.report_player_combat_highlight(uuid,text) to authenticated;
alter function public.claim_player_combat_highlight_cleanup(integer) owner to postgres;
revoke all on function public.claim_player_combat_highlight_cleanup(integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_player_combat_highlight_cleanup(integer) to service_role;
alter function public.finish_player_combat_highlight_cleanup(uuid,uuid,boolean,text) owner to postgres;
revoke all on function public.finish_player_combat_highlight_cleanup(uuid,uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_player_combat_highlight_cleanup(uuid,uuid,boolean,text) to service_role;
alter function public.close_ironclad_player_account(text) owner to postgres;
revoke all on function public.close_ironclad_player_account(text) from public,anon,authenticated,service_role;
grant execute on function public.close_ironclad_player_account(text) to service_role;
alter function ironclad_private.valid_combat_highlight_verified(jsonb,text,bigint,bigint) owner to postgres;
revoke all on function ironclad_private.valid_combat_highlight_verified(jsonb,text,bigint,bigint) from public,anon,authenticated,service_role;

create function public.get_player_combat_highlights_for_moderation(p_player_id uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_result jsonb;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Trusted moderation is required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId',q.player_id,'slotNumber',q.slot_number,'revision',q.revision,
    'hidden',q.hidden_at is not null,'title',coalesce(q.title,''),
    'uploadId',q.upload_id,'reportCount',q.report_count
  ) order by q.last_report desc nulls last,q.player_id,q.slot_number),'[]'::jsonb)
  into v_result from (
    select s.player_id,s.slot_number,s.revision,s.hidden_at,u.title,u.id as upload_id,
      count(r.id) as report_count,max(r.created_at) as last_report
    from public.player_combat_highlight_slots s
    join public.players p on p.id=s.player_id and p.account_closed_at is null
    left join ironclad_private.player_combat_highlight_uploads u
      on u.id=s.current_upload_id and u.player_id=s.player_id and u.slot_number=s.slot_number
    left join ironclad_private.player_combat_highlight_reports r on r.upload_id=u.id
    where (p_player_id is not null and s.player_id=p_player_id)
      or (p_player_id is null and r.id is not null)
    group by s.player_id,s.slot_number,s.revision,s.hidden_at,u.title,u.id
    order by max(r.created_at) desc nulls last,s.player_id,s.slot_number
    limit 50
  ) q;
  return v_result;
end;
$$;
alter function public.get_player_combat_highlights_for_moderation(uuid) owner to postgres;
revoke all on function public.get_player_combat_highlights_for_moderation(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_player_combat_highlights_for_moderation(uuid) to service_role;

comment on table public.player_combat_highlight_slots is
  'Three fixed owner slots; media revisions and persistent holds are independent of Phase A Thought and Badge.';
comment on table ironclad_private.player_combat_highlight_uploads is
  'Immutable R2 upload attempts and durable deletion tombstones. Never store Clerk IDs or R2 credentials.';
comment on function public.complete_player_combat_highlight_upload(uuid,jsonb) is
  'Trusted server only: independently validate actual R2 bytes before supplying verified metadata. SQL validates all published limits again.';
comment on function public.can_access_my_player_combat_highlight(uuid,text) is
  'Worker must forward the actual Clerk JWT. Upload requests must stop at expiresAt; R2 object creation must be conditional and immutable.';
commit;
