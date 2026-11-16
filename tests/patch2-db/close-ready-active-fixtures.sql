-- Closes only the two Ready active acceptance fixtures on Staging.
-- Rehearse with rollback. Bind exact committed fixture IDs and fresh email evidence before commit.
begin isolation level repeatable read;
set local lock_timeout='2s';
set local statement_timeout='30s';
set local idle_in_transaction_session_timeout='1min';
set local client_min_messages=warning;

create temporary table ready_close_fixture(slug text primary key,id uuid unique) on commit drop;
insert into ready_close_fixture values
  ('ready-active-20261116-v1-a','__READY_FIXTURE_A_ID__'),
  ('ready-active-20261116-v1-b','__READY_FIXTURE_B_ID__');
create temporary table ready_old_notices(id uuid primary key) on commit drop;
insert into ready_old_notices select id from public.notifications;

do $$
declare
  f record;
  v_email_disabled_verified_at constant timestamptz:='__READY_EMAIL_DISABLED_VERIFIED_AT__';
  v_secret text;
  v_cancellation jsonb;
begin
  if current_user <> 'postgres'
    or clock_timestamp() not between v_email_disabled_verified_at and v_email_disabled_verified_at + interval '30 minutes'
    or (select count(*)=1 and bool_and(btrim(decrypted_secret)='https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/api/internal/transactional-email') from vault.decrypted_secrets where name='ironclad_transactional_email_worker_url') is distinct from true
    or has_function_privilege('service_role','public.claim_web_push_notifications(integer)','EXECUTE')
    or exists(select 1 from public.notifications where push_delivery_status='processing' or email_delivery_status='processing' or push_claim_token is not null or email_claim_token is not null)
  then raise exception 'Ready fixture cleanup blocked by Staging delivery guards'; end if;

  select nullif(btrim(decrypted_secret),'') into strict v_secret from vault.decrypted_secrets where name='ironclad_staging_synthetic_uat_fixture_secret';
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role","ref":"zzbnneprhjicmajpjkdg"}',true);
  perform ironclad_private.assert_staging_synthetic_uat_access(v_secret);

  if (select count(*) from public.tournaments t join ready_close_fixture fixture on fixture.id=t.id and fixture.slug=t.slug where t.title like '[SYNTHETIC STAGING] Ready active Match Room %' and t.status='in_progress') <> 2
    or (select count(*) from public.registrations where tournament_id in(select id from ready_close_fixture)) <> 16
    or exists(select 1 from public.registrations r where r.tournament_id in(select id from ready_close_fixture) and (
      r.registration_provenance is distinct from 'staging_synthetic_uat' or r.fixture_contract_version is distinct from 'staging-synthetic-v2'
      or not exists(select 1 from ironclad_private.staging_synthetic_uat_players p where p.player_id=r.profile_id and p.approved_alias in(select 'TestAcademy'||n from generate_series(1,8) n))))
  then raise exception 'Ready fixture cleanup scope does not match the committed synthetic run'; end if;

  for f in select * from ready_close_fixture order by slug loop
    v_cancellation := public.cancel_tournament(f.id,'Ready synthetic active Match Room verification complete. No result was played or reported.','ready-active-fixture-operator');
    if (v_cancellation->>'outcome') is distinct from 'cancelled' then
      raise exception 'Ready fixture was not canonically cancelled';
    end if;
  end loop;

  if exists(select 1 from public.notifications n where not exists(select 1 from ready_old_notices old where old.id=n.id)
    and (n.tournament_id is null or n.tournament_id not in(select id from ready_close_fixture)
      or n.push_delivery_status='processing' or n.email_delivery_status='processing'))
  then raise exception 'New notifications escaped the Ready fixture scope'; end if;

  update public.notifications n
  set metadata=coalesce(metadata,'{}')||jsonb_build_object('readyTestRun','ready-active-20261116-v1','syntheticFixture',true)
  where n.tournament_id in(select id from ready_close_fixture) and not exists(select 1 from ready_old_notices old where old.id=n.id);
  update public.notifications n
  set push_delivery_status='skipped',push_next_attempt_at=null,push_claim_token=null,push_claim_expires_at=null,push_completed_at=clock_timestamp(),push_last_error_code='READY_STAGING_FIXTURE_SUPPRESSED'
  where n.tournament_id in(select id from ready_close_fixture) and not exists(select 1 from ready_old_notices old where old.id=n.id)
    and push_delivery_status in('pending','retryable_failure');
  update public.notifications n
  set email_delivery_status='skipped',email_next_attempt_at=null,email_claim_token=null,email_claim_expires_at=null,email_sent_at=null,email_provider_message_id=null,email_last_error_code='READY_STAGING_FIXTURE_SUPPRESSED'
  where n.tournament_id in(select id from ready_close_fixture) and not exists(select 1 from ready_old_notices old where old.id=n.id)
    and email_delivery_status in('pending','retryable_failure');
  if exists(select 1 from public.notifications where tournament_id in(select id from ready_close_fixture)
    and (push_delivery_status in('pending','retryable_failure','processing') or email_delivery_status in('pending','retryable_failure','processing')))
  then raise exception 'Ready fixture retained a deliverable notification'; end if;
end $$;
set constraints all immediate;
rollback;

select slug, status, terminal_at is not null as terminal
from public.tournaments
where id in ('__READY_FIXTURE_A_ID__','__READY_FIXTURE_B_ID__')
  and slug in ('ready-active-20261116-v1-a','ready-active-20261116-v1-b')
order by slug;
