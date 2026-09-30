begin;

-- M13 is an observational projection layer.  It creates no competitive facts,
-- and all private/authenticated reads remain behind trusted-server wrappers.

create index if not exists warfront_operations_open_discovery_idx
  on public.warfront_operations(format, expires_at, id)
  where status = 'open';

create index if not exists warfront_operations_challenger_open_read_idx
  on public.warfront_operations(challenger_company_id, expires_at, id)
  where status = 'open';

create function ironclad_private.warfront_public_player_projection(
  p_player_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'playerId', case
      when player.account_closed_at is null and player.public_profile_enabled
        then player.id
      else null::uuid
    end,
    'displayName', case
      when player.account_closed_at is not null then 'Former Competitor'
      when player.public_profile_enabled then player.display_name
      else player.in_game_name
    end
  )
  from public.players as player
  where player.id = p_player_id;
$$;

-- Keep M11 historical roster presentation on exactly the same Player privacy
-- contract as M13's active-roster projection.
create or replace function ironclad_private.warfront_public_operation_roster_projection(
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
      ironclad_private.warfront_public_player_projection(entry.player_id)
        || jsonb_build_object('eloSnapshot', entry.elo_snapshot)
      order by entry.selected_at asc, entry.id asc
    ),
    '[]'::jsonb
  )
  from public.warfront_operation_roster_entries as entry
  where entry.operation_id = p_operation_id
    and entry.side = p_side;
$$;

create function ironclad_private.warfront_company_active_roster_projection(
  p_company_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case when exists (
    select 1 from public.warfront_companies as company
    where company.id = p_company_id and company.status = 'active'
  ) then coalesce((
    select jsonb_agg(
      ironclad_private.warfront_public_player_projection(member.player_id)
        || jsonb_build_object('role', member.role, 'joinedAt', member.joined_at)
      order by case member.role
        when 'commander' then 1 when 'officer' then 2 else 3 end,
        pg_catalog.lower(coalesce(player.display_name, player.in_game_name)),
        member.player_id
    )
    from public.warfront_company_members as member
    join public.players as player on player.id = member.player_id
    where member.company_id = p_company_id and member.left_at is null
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;

create function ironclad_private.require_warfront_active_company_read_actor(
  p_actor_clerk_user_id text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid;
  v_company_id uuid;
begin
  v_player_id := ironclad_private.resolve_open_warfront_operation_room_player(
    p_actor_clerk_user_id
  );
  select member.company_id into v_company_id
  from public.warfront_company_members as member
  join public.warfront_companies as company on company.id = member.company_id
  where member.player_id = v_player_id
    and member.left_at is null
    and company.status = 'active';
  if not found or v_company_id is null then
    raise exception 'WARFRONT_COMPETITIVE_DISCOVERY_UNAVAILABLE'
      using errcode = '42501';
  end if;
  return v_company_id;
end;
$$;

create function ironclad_private.warfront_operation_room_unread_rows(
  p_player_id uuid,
  p_operation_ids uuid[] default null
)
returns table(operation_id uuid, unread_count bigint, unread_source text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with eligible as (
    select
      operation.id as operation_id,
      viewer.side as viewer_side,
      coalesce(read_cursor.last_read_sequence, 0) as last_read_sequence
    from public.warfront_operations as operation
    join public.warfront_operation_roster_entries as viewer
      on viewer.operation_id = operation.id and viewer.player_id = p_player_id
    left join public.warfront_operation_room_reads as read_cursor
      on read_cursor.operation_id = operation.id
     and read_cursor.player_id = p_player_id
    where (p_operation_ids is null or operation.id = any(p_operation_ids))
      and operation.opponent_company_id is not null
      and operation.accepted_by_player_id is not null
      and operation.opponent_roster_elo_snapshot is not null
      and operation.accepted_at is not null
      and operation.roster_locked_at is not null
      and operation.status in ('accepted','in_progress','pending_result','completed','cancelled')
      and not (operation.status = 'cancelled' and operation.accepted_at is null)
      and not exists (
        select 1 from ironclad_private.warfront_operation_room_content_purges as purge
        where purge.operation_id = operation.id
      )
      and (select count(*) from public.warfront_operation_roster_entries as entry
           where entry.operation_id = operation.id) =
          (case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end) * 2
      and (select count(*) from public.warfront_operation_roster_entries as entry
           where entry.operation_id = operation.id and entry.side = 'challenger') =
          (case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end)
      and (select count(*) from public.warfront_operation_roster_entries as entry
           where entry.operation_id = operation.id and entry.side = 'opponent') =
          (case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end)
      and (select count(distinct entry.player_id) from public.warfront_operation_roster_entries as entry
           where entry.operation_id = operation.id) =
          (case operation.format when '2v2' then 2 when '3v3' then 3 when '4v4' then 4 else 0 end) * 2
  )
  select
    eligible.operation_id,
    count(message.id) as unread_count,
    case when coalesce(bool_or(message.sender_kind = 'admin'), false) then 'admin'
         when coalesce(bool_or(message.sender_kind = 'player'
              and author_entry.side is distinct from eligible.viewer_side), false) then 'opponent'
         else 'generic' end as unread_source
  from eligible
  left join public.warfront_operation_chat_messages as message
    on message.operation_id = eligible.operation_id
   and message.sequence > eligible.last_read_sequence
   and (message.sender_kind = 'admin' or message.sender_player_id is distinct from p_player_id)
  left join public.warfront_operation_roster_entries as author_entry
    on author_entry.operation_id = eligible.operation_id
   and author_entry.player_id = message.sender_player_id
  group by eligible.operation_id, eligible.viewer_side;
$$;

create or replace function public.get_warfront_operation_room_unread_summary(
  p_operation_ids uuid[],
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_player_id uuid;
  v_summary jsonb;
begin
  if p_operation_ids is null
    or coalesce(pg_catalog.array_ndims(p_operation_ids), 0) <> 1
    or pg_catalog.cardinality(p_operation_ids) not between 1 and 128
    or pg_catalog.array_position(p_operation_ids, null::uuid) is not null
    or (select count(distinct id) from pg_catalog.unnest(p_operation_ids) as ids(id)) <> pg_catalog.cardinality(p_operation_ids)
    or v_actor is null
    or pg_catalog.char_length(v_actor) > 256
    or v_actor ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID' using errcode = '22023';
  end if;
  v_player_id := ironclad_private.resolve_open_warfront_operation_room_player(v_actor);
  select coalesce(jsonb_agg(jsonb_build_object(
    'operationId', unread_row.operation_id,
    'unreadCount', unread_row.unread_count,
    'unreadSource', unread_row.unread_source
  ) order by unread_row.operation_id), '[]'::jsonb)
  into v_summary
  from ironclad_private.warfront_operation_room_unread_rows(v_player_id, p_operation_ids) as unread_row;
  return jsonb_build_object('operations', v_summary);
end;
$$;

create function ironclad_private.warfront_company_operation_list_item_projection(
  p_operation_id uuid,
  p_company_id uuid,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_operation public.warfront_operations%rowtype;
  v_side text;
  v_opponent public.warfront_companies%rowtype;
  v_finalization public.warfront_operation_result_finalizations%rowtype;
begin
  select operation.* into v_operation from public.warfront_operations as operation
  where operation.id = p_operation_id
    and p_company_id in (operation.challenger_company_id, operation.opponent_company_id);
  if not found then
    raise exception 'WARFRONT_OPERATION_UNAVAILABLE' using errcode = '42501';
  end if;
  v_side := case when v_operation.challenger_company_id = p_company_id
    then 'challenger' else 'opponent' end;
  select company.* into v_opponent from public.warfront_companies as company
  where company.id = case v_side when 'challenger' then v_operation.opponent_company_id else v_operation.challenger_company_id end;
  select finalization.* into v_finalization
  from public.warfront_operation_result_finalizations as finalization
  where finalization.operation_id = v_operation.id;
  return jsonb_build_object(
    'operationId', v_operation.id,
    'status', v_operation.status,
    'logicalStatus', case when v_operation.status = 'open' and v_operation.expires_at <= p_observed_at then 'expired' else v_operation.status end,
    'format', v_operation.format,
    'seriesBestOf', v_operation.series_best_of,
    'region', v_operation.region,
    'openedAt', v_operation.opened_at,
    'expiresAt', v_operation.expires_at,
    'acceptedAt', v_operation.accepted_at,
    'startedAt', v_operation.started_at,
    'completedAt', v_operation.completed_at,
    'cancelledAt', v_operation.cancelled_at,
    'viewerSide', v_side,
    'companyRosterEloSnapshot', case v_side when 'challenger' then v_operation.challenger_roster_elo_snapshot else v_operation.opponent_roster_elo_snapshot end,
    'opponentRosterEloSnapshot', case v_side when 'challenger' then v_operation.opponent_roster_elo_snapshot else v_operation.challenger_roster_elo_snapshot end,
    'opponent', case when v_opponent.id is null then null else jsonb_build_object('companyId',v_opponent.id,'name',v_opponent.name,'tag',v_opponent.tag,'slug',v_opponent.slug,'logo',v_opponent.logo_path) end,
    'finalResult', case when v_operation.status <> 'completed' or v_finalization.operation_id is null then null else jsonb_build_object(
      'companyWins', case v_side when 'challenger' then v_finalization.final_challenger_wins else v_finalization.final_opponent_wins end,
      'opponentWins', case v_side when 'challenger' then v_finalization.final_opponent_wins else v_finalization.final_challenger_wins end,
      'winnerSide', v_finalization.final_winner_side,
      'finalizationMode', v_finalization.finalization_mode
    ) end
  );
end;
$$;

create function public.get_warfront_company_profile(
  p_company_id uuid default null,
  p_company_slug text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_slug text := pg_catalog.nullif(pg_catalog.btrim(p_company_slug), '');
  v_company public.warfront_companies%rowtype;
begin
  if (p_company_id is null) = (v_slug is null)
     or (p_company_slug is not null and v_slug is null)
     or (v_slug is not null and (pg_catalog.char_length(v_slug) < 2 or pg_catalog.char_length(v_slug) > 80 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$')) then
    raise exception 'WARFRONT_COMPANY_PROFILE_INPUT_INVALID' using errcode = '22023';
  end if;
  select company.* into v_company from public.warfront_companies as company
  where (p_company_id is not null and company.id = p_company_id)
     or (v_slug is not null and company.slug = v_slug);
  if not found then return null; end if;
  return jsonb_build_object(
    'companyId', v_company.id, 'name', v_company.name, 'tag', v_company.tag,
    'slug', v_company.slug, 'logo', v_company.logo_path, 'banner', v_company.banner_path,
    'description', v_company.description, 'region', v_company.region,
    'foundedAt', v_company.founded_at, 'createdAt', v_company.created_at,
    'status', v_company.status,
    'archivedAt', case when v_company.status = 'archived' then v_company.archived_at else null end,
    'activeRoster', ironclad_private.warfront_company_active_roster_projection(v_company.id),
    'historicalRosterAvailable', false,
    'competitiveSummary', public.get_warfront_company_summary(v_company.id)
  );
end;
$$;

create function public.get_warfront_current_player_context(
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor text := pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id), '');
  v_player public.players%rowtype;
  v_company public.warfront_companies%rowtype;
  v_role text;
  v_joined_at timestamptz;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_pending integer := 0;
  v_issued integer := 0;
  v_live integer := 0;
  v_actionable integer := 0;
  v_unread integer := 0;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode = '42501';
  end if;
  if v_actor is null or pg_catalog.char_length(v_actor) > 256 or v_actor ~ '[[:cntrl:]]' then
    raise exception 'WARFRONT_COMPANY_INPUT_INVALID' using errcode = '22023';
  end if;
  select player.* into v_player from public.players as player where player.clerk_user_id = v_actor;
  if not found then return jsonb_build_object('playerState','missing','serverNow',v_now); end if;
  if v_player.account_closed_at is not null then return jsonb_build_object('playerState','closed','serverNow',v_now); end if;
  select count(*)::integer into v_pending from public.warfront_company_invitations as invitation
  where invitation.recipient_player_id = v_player.id and invitation.status = 'pending';
  select company.* into v_company
  from public.warfront_company_members as member
  join public.warfront_companies as company on company.id = member.company_id
  where member.player_id = v_player.id and member.left_at is null and company.status = 'active';
  if not found then
    return jsonb_build_object('playerState','open_without_company','pendingInvitationCount',v_pending,'competitiveDiscoveryEnabled',false,'serverNow',v_now);
  end if;
  select member.role, member.joined_at into v_role, v_joined_at
  from public.warfront_company_members as member
  where member.company_id = v_company.id
    and member.player_id = v_player.id
    and member.left_at is null;
  if not found or v_role is null then
    raise exception 'WARFRONT_COMPANY_MEMBERSHIP_UNAVAILABLE' using errcode = '42501';
  end if;
  select count(*)::integer into v_issued from public.warfront_operations as operation
  where operation.challenger_company_id = v_company.id and operation.status = 'open' and operation.expires_at > v_now;
  select count(*)::integer into v_live from public.warfront_operations as operation
  where v_company.id in (operation.challenger_company_id, operation.opponent_company_id)
    and operation.status in ('accepted','in_progress','pending_result');
  select count(*)::integer into v_actionable from public.warfront_operations as operation
  join public.warfront_operation_roster_entries as entry on entry.operation_id = operation.id and entry.player_id = v_player.id
  where operation.status in ('accepted','in_progress','pending_result');
  select count(*)::integer into v_unread
  from ironclad_private.warfront_operation_room_unread_rows(
    v_player.id,
    array(
      select operation.id
      from public.warfront_operations as operation
      join public.warfront_operation_roster_entries as entry
        on entry.operation_id = operation.id and entry.player_id = v_player.id
      where operation.status in ('accepted','in_progress','pending_result')
    )
  ) as unread
  where unread.unread_count > 0;
  return jsonb_build_object(
    'playerState','open_with_company',
    'company',jsonb_build_object('companyId',v_company.id,'name',v_company.name,'tag',v_company.tag,'slug',v_company.slug,'logo',v_company.logo_path,'banner',v_company.banner_path,'status',v_company.status,'role',v_role,'joinedAt',v_joined_at),
    'capabilities',jsonb_build_object(
      'canInvite',v_role in ('commander','officer'),'canRevokeInvitation',v_role in ('commander','officer'),
      'canRemoveOrdinaryMember',v_role in ('commander','officer'),'canPromoteMember',v_role = 'commander',
      'canDemoteOfficer',v_role = 'commander','canTransferCommander',v_role = 'commander',
      'canArchiveCompany',v_role = 'commander','canLeaveCompany',v_role <> 'commander'
    ),
    'pendingInvitationCount',v_pending,'logicalOpenIssuedOperationCount',v_issued,
    'liveOperationCount',v_live,'lockedRosterActionableOperationCount',v_actionable,
    'unreadLiveRoomCount',v_unread,'competitiveDiscoveryEnabled',true,'serverNow',v_now
  );
end;
$$;

create function public.get_warfront_current_player_context_api(p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return public.get_warfront_current_player_context(p_actor_clerk_user_id);
end;
$$;

create function public.get_warfront_company_discovery_api(
  p_actor_clerk_user_id text,
  p_before_founded_at timestamptz default null,
  p_before_company_id uuid default null,
  p_limit integer default 25
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_company_id uuid; v_items jsonb; v_more boolean; v_next_at timestamptz; v_next_id uuid;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if (p_before_founded_at is null) is distinct from (p_before_company_id is null) or p_limit is null or p_limit not between 1 and 50 then raise exception 'WARFRONT_COMPANY_DISCOVERY_INPUT_INVALID' using errcode='22023'; end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  v_company_id:=ironclad_private.require_warfront_active_company_read_actor(p_actor_clerk_user_id);
  with candidate as (
    select company.* from public.warfront_companies as company
    where company.status='active' and company.id<>v_company_id
      and (p_before_founded_at is null or (company.founded_at,company.id)<(p_before_founded_at,p_before_company_id))
    order by company.founded_at desc,company.id desc limit p_limit+1
  ), page as (select * from candidate order by founded_at desc,id desc limit p_limit)
  select coalesce(jsonb_agg(jsonb_build_object('companyId',id,'name',name,'tag',tag,'slug',slug,'logo',logo_path,'banner',banner_path,'region',region,'foundedAt',founded_at) order by founded_at desc,id desc),'[]'::jsonb),
    (select count(*)>p_limit from candidate),
    (select founded_at from page order by founded_at asc,id asc limit 1),
    (select id from page order by founded_at asc,id asc limit 1)
  into v_items,v_more,v_next_at,v_next_id from page;
  if not coalesce(v_more,false) then v_next_at:=null;v_next_id:=null;end if;
  return jsonb_build_object('companies',v_items,'page',jsonb_build_object('limit',p_limit,'hasMore',coalesce(v_more,false),'nextBeforeFoundedAt',v_next_at,'nextBeforeCompanyId',v_next_id));
end;
$$;

create function public.get_warfront_open_operations_api(
  p_actor_clerk_user_id text,
  p_format text,
  p_region text default null,
  p_series_best_of smallint default null,
  p_after_expires_at timestamptz default null,
  p_after_operation_id uuid default null,
  p_limit integer default 25
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_company_id uuid;v_now timestamptz:=pg_catalog.clock_timestamp();v_region text:=pg_catalog.nullif(pg_catalog.btrim(p_region),'');v_items jsonb;v_more boolean;v_next_at timestamptz;v_next_id uuid;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  if p_format is null or p_format not in ('2v2','3v3','4v4') or (p_series_best_of is not null and p_series_best_of not in (3,5)) or (p_after_expires_at is null) is distinct from (p_after_operation_id is null) or p_limit is null or p_limit not between 1 and 50 or (p_region is not null and (v_region is null or p_region <> v_region or pg_catalog.char_length(v_region) > 80 or v_region ~ '[[:cntrl:]]')) then raise exception 'WARFRONT_OPERATION_DISCOVERY_INPUT_INVALID' using errcode='22023';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();v_company_id:=ironclad_private.require_warfront_active_company_read_actor(p_actor_clerk_user_id);
  with candidate as (
    select operation.*,company.name as company_name,company.tag as company_tag,company.slug as company_slug,company.logo_path as company_logo,company.banner_path as company_banner
    from public.warfront_operations as operation join public.warfront_companies as company on company.id=operation.challenger_company_id and company.status='active'
    where operation.status='open' and operation.expires_at>v_now and operation.challenger_company_id<>v_company_id and operation.format=p_format
      and (v_region is null or operation.region=v_region) and (p_series_best_of is null or operation.series_best_of=p_series_best_of)
      and (p_after_expires_at is null or (operation.expires_at,operation.id)>(p_after_expires_at,p_after_operation_id))
    order by operation.expires_at asc,operation.id asc limit p_limit+1
  ), page as (select * from candidate order by expires_at asc,id asc limit p_limit)
  select coalesce(jsonb_agg(jsonb_build_object('operationId',id,'format',format,'seriesBestOf',series_best_of,'region',region,'openedAt',opened_at,'expiresAt',expires_at,'serverNow',v_now,'logicalStatus','open','challengerRosterEloSnapshot',challenger_roster_elo_snapshot,'challengerCompany',jsonb_build_object('companyId',challenger_company_id,'name',company_name,'tag',company_tag,'slug',company_slug,'logo',company_logo,'banner',company_banner)) order by expires_at asc,id asc),'[]'::jsonb),
    (select count(*)>p_limit from candidate),(select expires_at from page order by expires_at desc,id desc limit 1),(select id from page order by expires_at desc,id desc limit 1)
  into v_items,v_more,v_next_at,v_next_id from page;
  if not coalesce(v_more,false) then v_next_at:=null;v_next_id:=null;end if;
  return jsonb_build_object('serverNow',v_now,'operations',v_items,'page',jsonb_build_object('limit',p_limit,'hasMore',coalesce(v_more,false),'nextAfterExpiresAt',v_next_at,'nextAfterOperationId',v_next_id));
end;
$$;

create function public.get_warfront_company_invitations_api(
  p_actor_clerk_user_id text,
  p_scope text,
  p_before_created_at timestamptz default null,
  p_before_invitation_id uuid default null,
  p_limit integer default 25
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_player_id uuid;v_company_id uuid;v_role text;v_items jsonb;v_more boolean;v_next_at timestamptz;v_next_id uuid;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  if p_scope is null or p_scope not in ('incoming','outgoing') or (p_before_created_at is null) is distinct from (p_before_invitation_id is null) or p_limit is null or p_limit not between 1 and 50 then raise exception 'WARFRONT_COMPANY_INVITATION_READ_INPUT_INVALID' using errcode='22023';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();v_player_id:=ironclad_private.resolve_open_warfront_operation_room_player(p_actor_clerk_user_id);
  if p_scope='outgoing' then
    v_company_id:=ironclad_private.require_warfront_active_company_read_actor(p_actor_clerk_user_id);
    select member.role into v_role from public.warfront_company_members as member where member.company_id=v_company_id and member.player_id=v_player_id and member.left_at is null;
    if not found or v_role not in ('commander','officer') then raise exception 'WARFRONT_COMPANY_MANAGEMENT_UNAUTHORIZED' using errcode='42501';end if;
  end if;
  with candidate as (
    select invitation.* from public.warfront_company_invitations as invitation
    where invitation.status='pending'
      and ((p_scope='incoming' and invitation.recipient_player_id=v_player_id) or (p_scope='outgoing' and invitation.company_id=v_company_id))
      and (p_before_created_at is null or (invitation.created_at,invitation.id)<(p_before_created_at,p_before_invitation_id))
    order by invitation.created_at desc,invitation.id desc limit p_limit+1
  ), page as (select * from candidate order by created_at desc,id desc limit p_limit)
  select coalesce(jsonb_agg(jsonb_build_object('invitationId',page.id,'status','pending','createdAt',page.created_at,'actionable',p_scope='incoming','revocable',p_scope='outgoing','company',jsonb_build_object('companyId',company.id,'name',company.name,'tag',company.tag,'slug',company.slug,'logo',company.logo_path),'inviter',ironclad_private.warfront_public_player_projection(page.invited_by_player_id),'recipient',case when p_scope='outgoing' then ironclad_private.warfront_public_player_projection(page.recipient_player_id) else null end) order by page.created_at desc,page.id desc),'[]'::jsonb),
    (select count(*)>p_limit from candidate),(select created_at from page order by created_at asc,id asc limit 1),(select id from page order by created_at asc,id asc limit 1)
  into v_items,v_more,v_next_at,v_next_id from page join public.warfront_companies as company on company.id=page.company_id;
  if not coalesce(v_more,false) then v_next_at:=null;v_next_id:=null;end if;
  return jsonb_build_object('scope',p_scope,'invitations',v_items,'page',jsonb_build_object('limit',p_limit,'hasMore',coalesce(v_more,false),'nextBeforeCreatedAt',v_next_at,'nextBeforeInvitationId',v_next_id));
end;
$$;

create function public.get_warfront_company_operations_api(
  p_actor_clerk_user_id text,p_bucket text,p_cursor_at timestamptz default null,p_cursor_operation_id uuid default null,p_limit integer default 25
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_company_id uuid;v_now timestamptz:=pg_catalog.clock_timestamp();v_items jsonb;v_more boolean;v_next_at timestamptz;v_next_id uuid;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  if p_bucket is null or p_bucket not in ('issued_open','expired_open','live','completed','cancelled') or (p_cursor_at is null) is distinct from (p_cursor_operation_id is null) or p_limit is null or p_limit not between 1 and 50 then raise exception 'WARFRONT_COMPANY_OPERATION_READ_INPUT_INVALID' using errcode='22023';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();v_company_id:=ironclad_private.require_warfront_active_company_read_actor(p_actor_clerk_user_id);
  if p_bucket='issued_open' then
    with candidate as (select operation.id,operation.expires_at as sort_at from public.warfront_operations operation where operation.challenger_company_id=v_company_id and operation.status='open' and operation.expires_at>v_now and (p_cursor_at is null or (operation.expires_at,operation.id)>(p_cursor_at,p_cursor_operation_id)) order by operation.expires_at,operation.id limit p_limit+1),page as(select * from candidate order by sort_at,id limit p_limit)
    select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now) order by sort_at,id),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at desc,id desc limit 1),(select id from page order by sort_at desc,id desc limit 1) into v_items,v_more,v_next_at,v_next_id from page;
  elsif p_bucket='expired_open' then
    with candidate as (select operation.id,operation.expires_at as sort_at from public.warfront_operations operation where operation.challenger_company_id=v_company_id and operation.status='open' and operation.expires_at<=v_now and (p_cursor_at is null or (operation.expires_at,operation.id)<(p_cursor_at,p_cursor_operation_id)) order by operation.expires_at desc,operation.id desc limit p_limit+1),page as(select * from candidate order by sort_at desc,id desc limit p_limit)
    select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now) order by sort_at desc,id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at,id limit 1),(select id from page order by sort_at,id limit 1) into v_items,v_more,v_next_at,v_next_id from page;
  elsif p_bucket='live' then
    with candidate as (select operation.id,operation.accepted_at as sort_at from public.warfront_operations operation where v_company_id in(operation.challenger_company_id,operation.opponent_company_id) and operation.status in('accepted','in_progress','pending_result') and operation.accepted_at is not null and (p_cursor_at is null or (operation.accepted_at,operation.id)<(p_cursor_at,p_cursor_operation_id)) order by operation.accepted_at desc,operation.id desc limit p_limit+1),page as(select * from candidate order by sort_at desc,id desc limit p_limit)
    select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now) order by sort_at desc,id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at,id limit 1),(select id from page order by sort_at,id limit 1) into v_items,v_more,v_next_at,v_next_id from page;
  elsif p_bucket='completed' then
    with candidate as (select operation.id,operation.completed_at as sort_at from public.warfront_operations operation where v_company_id in(operation.challenger_company_id,operation.opponent_company_id) and operation.status='completed' and (p_cursor_at is null or (operation.completed_at,operation.id)<(p_cursor_at,p_cursor_operation_id)) order by operation.completed_at desc,operation.id desc limit p_limit+1),page as(select * from candidate order by sort_at desc,id desc limit p_limit)
    select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now) order by sort_at desc,id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at,id limit 1),(select id from page order by sort_at,id limit 1) into v_items,v_more,v_next_at,v_next_id from page;
  else
    with candidate as (select operation.id,operation.cancelled_at as sort_at from public.warfront_operations operation where v_company_id in(operation.challenger_company_id,operation.opponent_company_id) and operation.status='cancelled' and (p_cursor_at is null or (operation.cancelled_at,operation.id)<(p_cursor_at,p_cursor_operation_id)) order by operation.cancelled_at desc,operation.id desc limit p_limit+1),page as(select * from candidate order by sort_at desc,id desc limit p_limit)
    select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now) order by sort_at desc,id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at,id limit 1),(select id from page order by sort_at,id limit 1) into v_items,v_more,v_next_at,v_next_id from page;
  end if;
  if not coalesce(v_more,false) then v_next_at:=null;v_next_id:=null;end if;
  return jsonb_build_object('bucket',p_bucket,'serverNow',v_now,'operations',v_items,'page',jsonb_build_object('limit',p_limit,'hasMore',coalesce(v_more,false),'nextCursorAt',v_next_at,'nextOperationId',v_next_id));
end;
$$;

create function public.get_warfront_operation_room_bootstrap(
  p_operation_id uuid,p_actor_clerk_user_id text
)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
  declare v_actor text:=pg_catalog.nullif(pg_catalog.btrim(p_actor_clerk_user_id),'');v_player_id uuid;v_operation public.warfront_operations%rowtype;v_challenger public.warfront_companies%rowtype;v_opponent public.warfront_companies%rowtype;v_side text;v_dice jsonb;v_result jsonb;v_assistance jsonb;v_rosters jsonb;v_purged_at timestamptz;v_last_sequence bigint;v_last_read_sequence bigint;v_unread bigint:=0;v_now timestamptz:=pg_catalog.statement_timestamp();v_can_roll boolean:=false;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  if p_operation_id is null or v_actor is null or pg_catalog.char_length(v_actor)>256 or v_actor~'[[:cntrl:]]' then raise exception 'WARFRONT_OPERATION_ROOM_INPUT_INVALID' using errcode='22023';end if;
  v_player_id:=ironclad_private.resolve_open_warfront_operation_room_player(v_actor);
  select operation.* into v_operation from public.warfront_operations operation where operation.id=p_operation_id;
  if not found then raise exception 'WARFRONT_OPERATION_ROOM_UNAVAILABLE' using errcode='42501';end if;
  perform ironclad_private.require_warfront_operation_room(v_operation);
  perform ironclad_private.require_warfront_operation_room_participant(v_operation.id,v_player_id);
  select company.* into v_challenger from public.warfront_companies as company where company.id=v_operation.challenger_company_id;
  select company.* into v_opponent from public.warfront_companies as company where company.id=v_operation.opponent_company_id;
  select entry.side into v_side from public.warfront_operation_roster_entries entry where entry.operation_id=v_operation.id and entry.player_id=v_player_id;
  if not found or v_side is null then raise exception 'WARFRONT_OPERATION_ROOM_UNAVAILABLE' using errcode='42501';end if;
  select coalesce(jsonb_agg(jsonb_build_object('side',entry.side,'eloSnapshot',entry.elo_snapshot,'selectedAt',entry.selected_at)||ironclad_private.warfront_public_player_projection(entry.player_id) order by case entry.side when 'challenger' then 1 else 2 end,entry.selected_at,entry.id),'[]'::jsonb) into v_rosters from public.warfront_operation_roster_entries entry where entry.operation_id=v_operation.id;
  v_dice:=public.get_warfront_operation_dice_rolloff(v_operation.id,v_actor);
  v_result:=ironclad_private.warfront_operation_result_projection(v_operation.id,v_side,false);
  v_assistance:=ironclad_private.warfront_operation_room_assistance_projection(v_operation.id);
  select purge.purged_at into v_purged_at from ironclad_private.warfront_operation_room_content_purges purge where purge.operation_id=v_operation.id;
  if v_purged_at is null then
    select read_cursor.last_read_sequence into v_last_read_sequence from public.warfront_operation_room_reads as read_cursor where read_cursor.operation_id=v_operation.id and read_cursor.player_id=v_player_id;
    if not found then v_last_read_sequence:=0;end if;
    select sequence.last_sequence into v_last_sequence from ironclad_private.warfront_operation_chat_sequences sequence where sequence.operation_id=v_operation.id;
    select row.unread_count into v_unread from ironclad_private.warfront_operation_room_unread_rows(v_player_id,array[v_operation.id]) row;
  else v_last_sequence:=null;v_last_read_sequence:=null;v_unread:=0;end if;
  select coalesce(bool_or((game->>'canRoll')::boolean),false) into v_can_roll from jsonb_array_elements(v_dice->'games') game;
  return jsonb_build_object('operationId',v_operation.id,'status',v_operation.status,'logicalStatus',v_operation.status,'format',v_operation.format,'seriesBestOf',v_operation.series_best_of,'region',v_operation.region,'openedAt',v_operation.opened_at,'expiresAt',v_operation.expires_at,'acceptedAt',v_operation.accepted_at,'startedAt',v_operation.started_at,'completedAt',v_operation.completed_at,'cancelledAt',v_operation.cancelled_at,'serverNow',v_now,'challengerCompany',jsonb_build_object('companyId',v_challenger.id,'name',v_challenger.name,'tag',v_challenger.tag,'slug',v_challenger.slug,'logo',v_challenger.logo_path,'banner',v_challenger.banner_path),'opponentCompany',jsonb_build_object('companyId',v_opponent.id,'name',v_opponent.name,'tag',v_opponent.tag,'slug',v_opponent.slug,'logo',v_opponent.logo_path,'banner',v_opponent.banner_path),'rosters',v_rosters,'challengerRosterEloSnapshot',v_operation.challenger_roster_elo_snapshot,'opponentRosterEloSnapshot',v_operation.opponent_roster_elo_snapshot,'viewerPlayerId',v_player_id,'viewerSide',v_side,'dice',v_dice,'result',v_result,'assistance',v_assistance,'chat',jsonb_build_object('contentState',case when v_purged_at is null then 'available' else 'purged' end,'contentPurgedAt',v_purged_at,'latestSequence',v_last_sequence,'lastReadSequence',v_last_read_sequence,'unreadCount',coalesce(v_unread,0)),'capabilities',jsonb_build_object('canRollByRoomState',v_can_roll,'canSubmitResultByRoomState',v_operation.status='in_progress' and (v_result->>'submittedResult') is null,'canConfirmResultByRoomState',coalesce((v_result->>'canConfirm')::boolean,false),'canDisputeByRoomState',coalesce((v_result->>'canDispute')::boolean,false),'canReadChat',true,'canSendChatByRoomState',v_purged_at is null and v_operation.status in('accepted','in_progress','pending_result')));
end;
$$;

create function public.get_warfront_operation_room_bootstrap_api(uuid,text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return public.get_warfront_operation_room_bootstrap($1,$2);
end;
$$;

-- Private read cores keep membership/role authorization and their projections
-- in one STABLE snapshot.  The public wrappers below acquire the canonical
-- closure barrier before entering these observational cores.
create function ironclad_private.warfront_company_discovery_read(p_actor_clerk_user_id text,p_before_founded_at timestamptz,p_before_company_id uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_company_id uuid;v_items jsonb;v_more boolean;v_next_at timestamptz;v_next_id uuid;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  if (p_before_founded_at is null) is distinct from (p_before_company_id is null) or p_limit is null or p_limit not between 1 and 50 then raise exception 'WARFRONT_COMPANY_DISCOVERY_INPUT_INVALID' using errcode='22023';end if;
  v_company_id:=ironclad_private.require_warfront_active_company_read_actor(p_actor_clerk_user_id);
  with candidate as (select company.* from public.warfront_companies company where company.status='active' and company.id<>v_company_id and (p_before_founded_at is null or (company.founded_at,company.id)<(p_before_founded_at,p_before_company_id)) order by company.founded_at desc,company.id desc limit p_limit+1),page as (select * from candidate order by founded_at desc,id desc limit p_limit)
  select coalesce(jsonb_agg(jsonb_build_object('companyId',id,'name',name,'tag',tag,'slug',slug,'logo',logo_path,'banner',banner_path,'region',region,'foundedAt',founded_at) order by founded_at desc,id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select founded_at from page order by founded_at asc,id asc limit 1),(select id from page order by founded_at asc,id asc limit 1) into v_items,v_more,v_next_at,v_next_id from page;
  if not coalesce(v_more,false) then v_next_at:=null;v_next_id:=null;end if;
  return jsonb_build_object('companies',v_items,'page',jsonb_build_object('limit',p_limit,'hasMore',coalesce(v_more,false),'nextBeforeFoundedAt',v_next_at,'nextBeforeCompanyId',v_next_id));
end;
$$;

create function ironclad_private.warfront_open_operations_read(p_actor_clerk_user_id text,p_format text,p_region text,p_series_best_of smallint,p_after_expires_at timestamptz,p_after_operation_id uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_company_id uuid;v_now timestamptz:=pg_catalog.statement_timestamp();v_region text:=pg_catalog.nullif(pg_catalog.btrim(p_region),'');v_items jsonb;v_more boolean;v_next_at timestamptz;v_next_id uuid;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  if p_format is null or p_format not in('2v2','3v3','4v4') or(p_series_best_of is not null and p_series_best_of not in(3,5))or(p_after_expires_at is null)is distinct from(p_after_operation_id is null)or p_limit is null or p_limit not between 1 and 50 or(p_region is not null and(v_region is null or p_region<>v_region or pg_catalog.char_length(v_region)>80 or v_region~'[[:cntrl:]]'))then raise exception 'WARFRONT_OPERATION_DISCOVERY_INPUT_INVALID' using errcode='22023';end if;
  v_company_id:=ironclad_private.require_warfront_active_company_read_actor(p_actor_clerk_user_id);
  with candidate as (select operation.*,company.name company_name,company.tag company_tag,company.slug company_slug,company.logo_path company_logo,company.banner_path company_banner from public.warfront_operations operation join public.warfront_companies company on company.id=operation.challenger_company_id and company.status='active' where operation.status='open' and operation.expires_at>v_now and operation.challenger_company_id<>v_company_id and operation.format=p_format and(v_region is null or operation.region=v_region)and(p_series_best_of is null or operation.series_best_of=p_series_best_of)and(p_after_expires_at is null or(operation.expires_at,operation.id)>(p_after_expires_at,p_after_operation_id))order by operation.expires_at,operation.id limit p_limit+1),page as(select * from candidate order by expires_at,id limit p_limit)
  select coalesce(jsonb_agg(jsonb_build_object('operationId',id,'format',format,'seriesBestOf',series_best_of,'region',region,'openedAt',opened_at,'expiresAt',expires_at,'serverNow',v_now,'logicalStatus','open','challengerRosterEloSnapshot',challenger_roster_elo_snapshot,'challengerCompany',jsonb_build_object('companyId',challenger_company_id,'name',company_name,'tag',company_tag,'slug',company_slug,'logo',company_logo,'banner',company_banner))order by expires_at,id),'[]'::jsonb),(select count(*)>p_limit from candidate),(select expires_at from page order by expires_at desc,id desc limit 1),(select id from page order by expires_at desc,id desc limit 1)into v_items,v_more,v_next_at,v_next_id from page;
  if not coalesce(v_more,false)then v_next_at:=null;v_next_id:=null;end if;
  return jsonb_build_object('serverNow',v_now,'operations',v_items,'page',jsonb_build_object('limit',p_limit,'hasMore',coalesce(v_more,false),'nextAfterExpiresAt',v_next_at,'nextAfterOperationId',v_next_id));
end;
$$;

create function ironclad_private.warfront_company_invitations_read(p_actor_clerk_user_id text,p_scope text,p_before_created_at timestamptz,p_before_invitation_id uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_player_id uuid;v_company_id uuid;v_role text;v_items jsonb;v_more boolean;v_next_at timestamptz;v_next_id uuid;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  if p_scope is null or p_scope not in('incoming','outgoing')or(p_before_created_at is null)is distinct from(p_before_invitation_id is null)or p_limit is null or p_limit not between 1 and 50 then raise exception 'WARFRONT_COMPANY_INVITATION_READ_INPUT_INVALID' using errcode='22023';end if;
  v_player_id:=ironclad_private.resolve_open_warfront_operation_room_player(p_actor_clerk_user_id);
  if p_scope='outgoing' then
    v_company_id:=ironclad_private.require_warfront_active_company_read_actor(p_actor_clerk_user_id);
    select member.role into v_role from public.warfront_company_members member where member.company_id=v_company_id and member.player_id=v_player_id and member.left_at is null;
    if not found or v_role not in('commander','officer')then raise exception 'WARFRONT_COMPANY_MANAGEMENT_UNAUTHORIZED' using errcode='42501';end if;
  end if;
  with candidate as (select invitation.* from public.warfront_company_invitations invitation where invitation.status='pending' and((p_scope='incoming' and invitation.recipient_player_id=v_player_id)or(p_scope='outgoing' and invitation.company_id=v_company_id))and(p_before_created_at is null or(invitation.created_at,invitation.id)<(p_before_created_at,p_before_invitation_id))order by invitation.created_at desc,invitation.id desc limit p_limit+1),page as(select * from candidate order by created_at desc,id desc limit p_limit)
  select coalesce(jsonb_agg(jsonb_build_object('invitationId',page.id,'status','pending','createdAt',page.created_at,'actionable',p_scope='incoming','revocable',p_scope='outgoing','company',jsonb_build_object('companyId',company.id,'name',company.name,'tag',company.tag,'slug',company.slug,'logo',company.logo_path),'inviter',ironclad_private.warfront_public_player_projection(page.invited_by_player_id),'recipient',case when p_scope='outgoing' then ironclad_private.warfront_public_player_projection(page.recipient_player_id)else null end)order by page.created_at desc,page.id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select created_at from page order by created_at asc,id asc limit 1),(select id from page order by created_at asc,id asc limit 1)into v_items,v_more,v_next_at,v_next_id from page join public.warfront_companies company on company.id=page.company_id;
  if not coalesce(v_more,false)then v_next_at:=null;v_next_id:=null;end if;
  return jsonb_build_object('scope',p_scope,'invitations',v_items,'page',jsonb_build_object('limit',p_limit,'hasMore',coalesce(v_more,false),'nextBeforeCreatedAt',v_next_at,'nextBeforeInvitationId',v_next_id));
end;
$$;

create function ironclad_private.warfront_company_operations_read(p_actor_clerk_user_id text,p_bucket text,p_cursor_at timestamptz,p_cursor_operation_id uuid,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_company_id uuid;v_now timestamptz:=pg_catalog.statement_timestamp();v_items jsonb;v_more boolean;v_next_at timestamptz;v_next_id uuid;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  if p_bucket is null or p_bucket not in('issued_open','expired_open','live','completed','cancelled')or(p_cursor_at is null)is distinct from(p_cursor_operation_id is null)or p_limit is null or p_limit not between 1 and 50 then raise exception 'WARFRONT_COMPANY_OPERATION_READ_INPUT_INVALID' using errcode='22023';end if;
  v_company_id:=ironclad_private.require_warfront_active_company_read_actor(p_actor_clerk_user_id);
  if p_bucket='issued_open' then
    with candidate as(select operation.id,operation.expires_at sort_at from public.warfront_operations operation where operation.challenger_company_id=v_company_id and operation.status='open' and operation.expires_at>v_now and(p_cursor_at is null or(operation.expires_at,operation.id)>(p_cursor_at,p_cursor_operation_id))order by operation.expires_at,operation.id limit p_limit+1),page as(select * from candidate order by sort_at,id limit p_limit) select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now)order by sort_at,id),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at desc,id desc limit 1),(select id from page order by sort_at desc,id desc limit 1)into v_items,v_more,v_next_at,v_next_id from page;
  elsif p_bucket='expired_open' then
    with candidate as(select operation.id,operation.expires_at sort_at from public.warfront_operations operation where operation.challenger_company_id=v_company_id and operation.status='open' and operation.expires_at<=v_now and(p_cursor_at is null or(operation.expires_at,operation.id)<(p_cursor_at,p_cursor_operation_id))order by operation.expires_at desc,operation.id desc limit p_limit+1),page as(select * from candidate order by sort_at desc,id desc limit p_limit) select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now)order by sort_at desc,id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at,id limit 1),(select id from page order by sort_at,id limit 1)into v_items,v_more,v_next_at,v_next_id from page;
  elsif p_bucket='live' then
    with candidate as(select operation.id,operation.accepted_at sort_at from public.warfront_operations operation where v_company_id in(operation.challenger_company_id,operation.opponent_company_id)and operation.status in('accepted','in_progress','pending_result')and operation.accepted_at is not null and(p_cursor_at is null or(operation.accepted_at,operation.id)<(p_cursor_at,p_cursor_operation_id))order by operation.accepted_at desc,operation.id desc limit p_limit+1),page as(select * from candidate order by sort_at desc,id desc limit p_limit) select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now)order by sort_at desc,id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at,id limit 1),(select id from page order by sort_at,id limit 1)into v_items,v_more,v_next_at,v_next_id from page;
  elsif p_bucket='completed' then
    with candidate as(select operation.id,operation.completed_at sort_at from public.warfront_operations operation where v_company_id in(operation.challenger_company_id,operation.opponent_company_id)and operation.status='completed'and(p_cursor_at is null or(operation.completed_at,operation.id)<(p_cursor_at,p_cursor_operation_id))order by operation.completed_at desc,operation.id desc limit p_limit+1),page as(select * from candidate order by sort_at desc,id desc limit p_limit) select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now)order by sort_at desc,id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at,id limit 1),(select id from page order by sort_at,id limit 1)into v_items,v_more,v_next_at,v_next_id from page;
  else
    with candidate as(select operation.id,operation.cancelled_at sort_at from public.warfront_operations operation where v_company_id in(operation.challenger_company_id,operation.opponent_company_id)and operation.status='cancelled'and(p_cursor_at is null or(operation.cancelled_at,operation.id)<(p_cursor_at,p_cursor_operation_id))order by operation.cancelled_at desc,operation.id desc limit p_limit+1),page as(select * from candidate order by sort_at desc,id desc limit p_limit) select coalesce(jsonb_agg(ironclad_private.warfront_company_operation_list_item_projection(id,v_company_id,v_now)order by sort_at desc,id desc),'[]'::jsonb),(select count(*)>p_limit from candidate),(select sort_at from page order by sort_at,id limit 1),(select id from page order by sort_at,id limit 1)into v_items,v_more,v_next_at,v_next_id from page;
  end if;
  if not coalesce(v_more,false)then v_next_at:=null;v_next_id:=null;end if;
  return jsonb_build_object('bucket',p_bucket,'serverNow',v_now,'operations',v_items,'page',jsonb_build_object('limit',p_limit,'hasMore',coalesce(v_more,false),'nextCursorAt',v_next_at,'nextOperationId',v_next_id));
end;
$$;

create function ironclad_private.warfront_current_company_roster_read(p_actor_clerk_user_id text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_company_id uuid;v_roster jsonb;
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  v_company_id:=ironclad_private.require_warfront_active_company_read_actor(p_actor_clerk_user_id);
  select coalesce(jsonb_agg(ironclad_private.warfront_public_player_projection(member.player_id)||jsonb_build_object('playerId',member.player_id,'role',member.role,'joinedAt',member.joined_at,'currentElo',case when player.account_closed_at is null then player.current_elo else null end)order by case member.role when 'commander' then 1 when 'officer' then 2 else 3 end,pg_catalog.lower(coalesce(player.display_name,player.in_game_name)),member.player_id),'[]'::jsonb) into v_roster from public.warfront_company_members member join public.players player on player.id=member.player_id where member.company_id=v_company_id and member.left_at is null;
  return jsonb_build_object('companyId',v_company_id,'roster',v_roster);
end;
$$;

create or replace function public.get_warfront_company_discovery_api(p_actor_clerk_user_id text,p_before_founded_at timestamptz default null,p_before_company_id uuid default null,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return ironclad_private.warfront_company_discovery_read(p_actor_clerk_user_id,p_before_founded_at,p_before_company_id,p_limit);
end;
$$;

create or replace function public.get_warfront_open_operations_api(p_actor_clerk_user_id text,p_format text,p_region text default null,p_series_best_of smallint default null,p_after_expires_at timestamptz default null,p_after_operation_id uuid default null,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return ironclad_private.warfront_open_operations_read(p_actor_clerk_user_id,p_format,p_region,p_series_best_of,p_after_expires_at,p_after_operation_id,p_limit);
end;
$$;

create or replace function public.get_warfront_company_invitations_api(p_actor_clerk_user_id text,p_scope text,p_before_created_at timestamptz default null,p_before_invitation_id uuid default null,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return ironclad_private.warfront_company_invitations_read(p_actor_clerk_user_id,p_scope,p_before_created_at,p_before_invitation_id,p_limit);
end;
$$;

create or replace function public.get_warfront_company_operations_api(p_actor_clerk_user_id text,p_bucket text,p_cursor_at timestamptz default null,p_cursor_operation_id uuid default null,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return ironclad_private.warfront_company_operations_read(p_actor_clerk_user_id,p_bucket,p_cursor_at,p_cursor_operation_id,p_limit);
end;
$$;

create function public.get_warfront_current_company_roster_api(p_actor_clerk_user_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if;
  perform ironclad_private.lock_warfront_account_closure_shared();
  return ironclad_private.warfront_current_company_roster_read(p_actor_clerk_user_id);
end;
$$;

alter function ironclad_private.warfront_public_player_projection(uuid) owner to postgres;
alter function ironclad_private.warfront_company_active_roster_projection(uuid) owner to postgres;
alter function ironclad_private.require_warfront_active_company_read_actor(text) owner to postgres;
alter function ironclad_private.warfront_operation_room_unread_rows(uuid,uuid[]) owner to postgres;
alter function ironclad_private.warfront_company_operation_list_item_projection(uuid,uuid,timestamptz) owner to postgres;
alter function ironclad_private.warfront_company_discovery_read(text,timestamptz,uuid,integer) owner to postgres;
alter function ironclad_private.warfront_open_operations_read(text,text,text,smallint,timestamptz,uuid,integer) owner to postgres;
alter function ironclad_private.warfront_company_invitations_read(text,text,timestamptz,uuid,integer) owner to postgres;
alter function ironclad_private.warfront_company_operations_read(text,text,timestamptz,uuid,integer) owner to postgres;
alter function ironclad_private.warfront_current_company_roster_read(text) owner to postgres;
alter function public.get_warfront_company_profile(uuid,text) owner to postgres;
alter function public.get_warfront_current_player_context(text) owner to postgres;
alter function public.get_warfront_current_player_context_api(text) owner to postgres;
alter function public.get_warfront_company_discovery_api(text,timestamptz,uuid,integer) owner to postgres;
alter function public.get_warfront_open_operations_api(text,text,text,smallint,timestamptz,uuid,integer) owner to postgres;
alter function public.get_warfront_company_invitations_api(text,text,timestamptz,uuid,integer) owner to postgres;
alter function public.get_warfront_company_operations_api(text,text,timestamptz,uuid,integer) owner to postgres;
alter function public.get_warfront_operation_room_bootstrap(uuid,text) owner to postgres;
alter function public.get_warfront_operation_room_bootstrap_api(uuid,text) owner to postgres;
alter function public.get_warfront_current_company_roster_api(text) owner to postgres;
alter function ironclad_private.warfront_public_operation_roster_projection(uuid,text) owner to postgres;
alter function public.get_warfront_operation_room_unread_summary(uuid[],text) owner to postgres;

revoke all on function ironclad_private.warfront_public_player_projection(uuid),ironclad_private.warfront_company_active_roster_projection(uuid),ironclad_private.require_warfront_active_company_read_actor(text),ironclad_private.warfront_operation_room_unread_rows(uuid,uuid[]),ironclad_private.warfront_company_operation_list_item_projection(uuid,uuid,timestamptz),ironclad_private.warfront_company_discovery_read(text,timestamptz,uuid,integer),ironclad_private.warfront_open_operations_read(text,text,text,smallint,timestamptz,uuid,integer),ironclad_private.warfront_company_invitations_read(text,text,timestamptz,uuid,integer),ironclad_private.warfront_company_operations_read(text,text,timestamptz,uuid,integer),ironclad_private.warfront_current_company_roster_read(text),ironclad_private.warfront_public_operation_roster_projection(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.get_warfront_operation_room_unread_summary(uuid[],text),public.get_warfront_current_player_context(text),public.get_warfront_current_player_context_api(text),public.get_warfront_company_discovery_api(text,timestamptz,uuid,integer),public.get_warfront_open_operations_api(text,text,text,smallint,timestamptz,uuid,integer),public.get_warfront_company_invitations_api(text,text,timestamptz,uuid,integer),public.get_warfront_company_operations_api(text,text,timestamptz,uuid,integer),public.get_warfront_operation_room_bootstrap(uuid,text),public.get_warfront_operation_room_bootstrap_api(uuid,text),public.get_warfront_current_company_roster_api(text) from public,anon,authenticated,service_role;
revoke all on function public.get_warfront_company_profile(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_warfront_company_profile(uuid,text) to anon,authenticated,service_role;
grant execute on function public.get_warfront_current_player_context_api(text),public.get_warfront_company_discovery_api(text,timestamptz,uuid,integer),public.get_warfront_open_operations_api(text,text,text,smallint,timestamptz,uuid,integer),public.get_warfront_company_invitations_api(text,text,timestamptz,uuid,integer),public.get_warfront_company_operations_api(text,text,timestamptz,uuid,integer),public.get_warfront_operation_room_bootstrap_api(uuid,text),public.get_warfront_current_company_roster_api(text) to service_role;

comment on function public.get_warfront_company_profile(uuid,text) is 'Public-safe WARFRONT Company profile. Archived Companies deliberately expose no reconstructed roster or archive actor.';
comment on function public.get_warfront_open_operations_api(text,text,text,smallint,timestamptz,uuid,integer) is 'Service-role-only logical-open challenge discovery. It deliberately exposes only challenger Company identity and frozen roster-average ELO before acceptance.';
comment on function public.get_warfront_current_player_context_api(text) is 'Service-role-only current Player WARFRONT bootstrap. Legal acceptance remains the existing application legal-gate concern.';
comment on function public.get_warfront_current_company_roster_api(text) is 'Service-role-only active own-Company operational roster. Player UUIDs are returned only for the caller''s current active Company; safe M11 Player presentation remains in effect.';
comment on function public.get_warfront_operation_room_bootstrap_api(uuid,text) is 'Service-role-only accepted-room participant snapshot. Current Company membership is not used after immutable roster locking.';

commit;
