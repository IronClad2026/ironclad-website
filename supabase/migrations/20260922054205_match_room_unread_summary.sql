begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Bounded, read-only participant projection. Never resolve/create/close rooms or
-- touch competition rows while polling. The lifecycle predicates deliberately
-- match match_room_context; the existing cursor is the sole read authority.
create function public.get_match_room_unread_summary(p_match_ids uuid[])
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_sub text := ironclad_private.match_room_actor();
  v_items jsonb;
begin
  if p_match_ids is null or cardinality(p_match_ids) > 128
    or coalesce(array_ndims(p_match_ids), 1) <> 1
    or array_position(p_match_ids, null) is not null
    or (select count(distinct id) from unnest(p_match_ids) id) <> cardinality(p_match_ids) then
    raise exception 'Invalid Match Room unread request' using errcode = '22023';
  end if;

  if not public.get_match_room_enabled() then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'matchId', attention.match_id,
    'roomId', attention.room_id,
    'unreadSource', case
      when attention.has_opponent and attention.has_admin then 'generic'
      when attention.has_admin then 'admin'
      else 'opponent'
    end
  ) order by attention.match_id), '[]'::jsonb)
  into v_items
  from (
    select m.id as match_id, room.id as room_id,
      exists (
        select 1 from public.match_messages message
        where message.room_id = room.id
          and message.sequence > coalesce(cursor.last_read_sequence, 0)
          and message.sender_kind = 'player'
          and message.sender_registration_id <> viewer.id
          and message.actor_clerk_user_id is distinct from v_sub
      ) as has_opponent,
      exists (
        select 1 from public.match_messages message
        where message.room_id = room.id
          and message.sequence > coalesce(cursor.last_read_sequence, 0)
          and message.sender_kind = 'admin'
          and message.actor_clerk_user_id is distinct from v_sub
      ) as has_admin
    from public.tournament_matches m
    join public.generated_brackets g on g.id = m.generated_bracket_id
    join public.tournament_brackets bracket on bracket.id = g.tournament_bracket_id
    join public.tournaments tournament on tournament.id = bracket.tournament_id
    join public.match_rooms room on room.match_id = m.id
      and room.communication_generation = m.communication_generation
      and room.player_one_registration_id = m.player_one_registration_id
      and room.player_two_registration_id = m.player_two_registration_id
      and room.closed_at is null
    join public.registrations viewer on viewer.id in (
      room.player_one_registration_id, room.player_two_registration_id
    ) and viewer.clerk_user_id = v_sub
      and viewer.tournament_id = tournament.id
      and viewer.tournament_bracket_id = bracket.id
    join public.players player on player.id = viewer.profile_id
      and player.clerk_user_id = v_sub and player.account_closed_at is null
    left join public.match_room_reads cursor on cursor.room_id = room.id
      and cursor.viewer_clerk_user_id = v_sub
    where m.id = any(p_match_ids)
      and bracket.launched_at is not null
      and tournament.status = 'in_progress'
      and m.status in ('scheduled', 'in_progress', 'pending_review')
      and m.outcome_type is null
      and ((g.format = 'single_elimination' and m.activation_version > 0)
        or g.format = 'round_robin')
      and not exists (
        select 1 from public.tournament_division_not_held_closures closure
        where closure.tournament_bracket_id = bracket.id
      )
      and (select count(*) = 2 from public.registrations member
        where member.id in (room.player_one_registration_id, room.player_two_registration_id)
          and member.tournament_id = tournament.id
          and member.tournament_bracket_id = bracket.id)
  ) attention
  where attention.has_opponent or attention.has_admin;

  return jsonb_build_object('items', v_items);
end;
$$;

alter function public.get_match_room_unread_summary(uuid[]) owner to postgres;
revoke all on function public.get_match_room_unread_summary(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_match_room_unread_summary(uuid[]) to authenticated;
comment on function public.get_match_room_unread_summary(uuid[]) is
  'Private current-participant Match card attention from genuine room read cursors. No bodies, actor IDs, history, admin bypass, notification read state, or mutations.';

commit;
