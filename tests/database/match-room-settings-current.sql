-- Full-migration disposable replay. Keep all positive and negative setting
-- checks in a transaction so this suite leaves the caller's settings intact.
begin;

create function pg_temp.expect_setting_denied(actor text)
returns void language plpgsql as $$
begin
  perform public.set_match_room_enabled(false, actor);
  raise exception 'Unexpectedly changed Match Room setting as %', current_user;
exception when insufficient_privilege then
  null;
end;
$$;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.expect_setting_denied('match-room-ci-setting');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"match-room-ci-player","metadata":{"role":"player"}}';
select pg_temp.expect_setting_denied('match-room-ci-player');
select pg_temp.expect_setting_denied('match-room-ci-setting');
set local request.jwt.claims = '{"role":"authenticated","sub":"match-room-ci-unverified","metadata":{"role":"admin"}}';
select pg_temp.expect_setting_denied('match-room-ci-unverified');
reset role;

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select pg_temp.expect_setting_denied('match-room-ci-unverified');
do $$
begin
  if public.get_patch2_admin_account_state('match-room-ci-setting') is distinct from 'verified-staff' then
    raise exception 'Fixture actor must be durable verified staff';
  end if;
  if public.set_match_room_enabled(false, 'match-room-ci-setting') is distinct from '{"enabled":false}'::jsonb
     or public.set_match_room_enabled(true, 'match-room-ci-setting') is distinct from '{"enabled":true}'::jsonb then
    raise exception 'Trusted Match Room setting call failed';
  end if;
end;
$$;
reset role;

do $$
begin
  if not exists (
    select from public.platform_settings
    where key = 'match_room' and value = '{"enabled":true}'::jsonb
      and updated_by_clerk_user_id = 'match-room-ci-setting'
  ) then
    raise exception 'Setting update did not persist with the verified actor';
  end if;
end;
$$;
rollback;
