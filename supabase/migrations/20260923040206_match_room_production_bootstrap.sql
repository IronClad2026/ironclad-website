begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Production release package entry point. The release executor deliberately
-- runs this NEW migration before the four immutable P03 migrations, all inside
-- one transaction. Do not run the four old files separately or use db push.
-- No externally visible writable RPC exists until the entire package commits
-- with the final hardening gate installed and this setting still disabled.
-- Existing Match Room installations are rejected instead of being reconfigured.
do $$
declare v_dependency record;
begin
  if to_regclass('public.match_rooms') is not null
    or to_regprocedure('public.resolve_match_room(uuid)') is not null
    or exists (select 1 from public.platform_settings where key = 'match_room') then
    raise exception 'P03 bootstrap requires an untouched pre-P03 baseline' using errcode = '55000';
  end if;
  -- Preserve the reviewed Production-only legal-acceptance authority and the
  -- exact reset/account-closure bodies which P03 wraps. Normalize only CR from
  -- stored SQL line endings; no whitespace or semantic normalization is allowed.
  for v_dependency in select * from (values
    ('ironclad_private.require_current_account_legal_acceptance()', '1d9f27ea057eb83dfb54addd8ecd7b29'),
    ('public.admin_reset_tournament_match(uuid,text)', '5bd3f4cef0a46706f9233e8c98730f0b'),
    ('public.close_ironclad_player_account(text)', 'c0b07afe3c577a5d2cf257dd13f85c0f')
  ) as dependencies(signature, expected_md5) loop
    if md5(replace(pg_get_functiondef(to_regprocedure(v_dependency.signature)), chr(13), ''))
      is distinct from v_dependency.expected_md5 then
      raise exception 'P03 dependency changed: %', v_dependency.signature using errcode = '55000';
    end if;
  end loop;
end;
$$;

insert into public.platform_settings(key, value)
values ('match_room', '{"enabled": false}'::jsonb);

commit;
