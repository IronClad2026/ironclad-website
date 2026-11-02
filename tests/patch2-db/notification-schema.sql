-- Local PostgreSQL fixture, deliberately not a full Supabase installation.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema ironclad_private;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

create table public.players (
  id uuid primary key,
  clerk_user_id text unique not null,
  account_closed_at timestamptz
);
create table public.tournaments (id uuid primary key, title text not null);
create table public.tournament_brackets (
  id uuid primary key, tournament_id uuid not null, launched_at timestamptz
);
create table public.registrations (
  id uuid primary key, tournament_id uuid not null,
  clerk_user_id text not null, registration_status text not null,
  waitlist_position integer, waitlist_offer_status text,
  tournament_bracket_id uuid, waitlist_offer_resolved_at timestamptz,
  admin_notes text not null default '', created_at timestamptz not null default now()
);
create table public.tournament_matches (
  id uuid primary key, tournament_id uuid not null, status text not null,
  deadline_at timestamptz, result jsonb, bracket jsonb, replay_ids uuid[]
);
-- Empty stubs permit the actual notification-only privacy-boundary source
-- fragment to revoke grants and drop policies without loading result authority.
create table public.match_result_submissions (id uuid primary key);
create table public.match_result_report_groups (id uuid primary key);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_clerk_user_id text, recipient_role text,
  type text not null, title text not null, message text not null,
  actor_clerk_user_id text, actor_display_name text,
  tournament_id uuid, tournament_title text, registration_id uuid,
  match_id uuid, report_group_id uuid, metadata jsonb not null default '{}',
  read_at timestamptz, created_at timestamptz not null default now(),
  event_key text, in_app_hidden_at timestamptz,
  email_template_key text, email_delivery_status text, email_attempt_count integer,
  email_next_attempt_at timestamptz, email_claim_token uuid,
  email_claim_expires_at timestamptz, email_sent_at timestamptz,
  email_last_error_code text, email_provider_message_id text,
  push_delivery_status text, push_attempt_count integer, push_next_attempt_at timestamptz,
  push_claim_token uuid, push_claim_expires_at timestamptz, push_enqueued_at timestamptz,
  push_completed_at timestamptz, push_last_error_code text
);
create table public.match_room_assistance (
  room_id uuid primary key, status text not null, request_version bigint not null,
  notification_id uuid references public.notifications(id) on delete set null
);
create table public.match_rooms (
  id uuid primary key, match_id uuid not null,
  player_one_registration_id uuid, player_two_registration_id uuid
);

-- The runner loads the real foundation policies followed by the committed
-- privacy hardening that removes all raw browser grants/policies. Any broader
-- trigger-adversary grants are temporary, explicit test instrumentation only.

create function public.patch2_notification_test_uuid(p_value integer)
returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(p_value::text,12,'0'))::uuid;
$$;

create function public.patch2_seed_notifications()
returns void language plpgsql set search_path = pg_catalog as $$
begin
  insert into public.players(id,clerk_user_id,account_closed_at) values
    (public.patch2_notification_test_uuid(10),'local_admin_a',null),
    (public.patch2_notification_test_uuid(11),'local_admin_b',null),
    (public.patch2_notification_test_uuid(12),'local_admin_closed','2026-01-01Z'),
    (public.patch2_notification_test_uuid(13),'local_same_player',null);
  insert into public.tournaments values
    (public.patch2_notification_test_uuid(1),'Local tournament one'),
    (public.patch2_notification_test_uuid(2),'Local tournament two');
  insert into public.tournament_brackets values
    (public.patch2_notification_test_uuid(801),public.patch2_notification_test_uuid(1),null),
    (public.patch2_notification_test_uuid(802),public.patch2_notification_test_uuid(2),null),
    (public.patch2_notification_test_uuid(803),public.patch2_notification_test_uuid(1),'2026-01-01Z');
  insert into public.registrations(id,tournament_id,clerk_user_id,registration_status,waitlist_position,waitlist_offer_status,tournament_bracket_id) values
    (public.patch2_notification_test_uuid(101),public.patch2_notification_test_uuid(1),'local_same_player','waitlisted',3,'offered',public.patch2_notification_test_uuid(801)),
    (public.patch2_notification_test_uuid(102),public.patch2_notification_test_uuid(2),'local_same_player','approved',null,null,public.patch2_notification_test_uuid(802));
  insert into public.tournament_matches values
    (public.patch2_notification_test_uuid(201),public.patch2_notification_test_uuid(1),'in_progress','2026-12-01Z','{"score":[1,0]}','{"round":2}',array[public.patch2_notification_test_uuid(701)]),
    (public.patch2_notification_test_uuid(202),public.patch2_notification_test_uuid(2),'pending','2026-12-02Z','{}','{"round":1}',array[]::uuid[]);
  insert into public.match_rooms values
    ('10000000-0000-4000-8000-000000000001',public.patch2_notification_test_uuid(201),public.patch2_notification_test_uuid(101),public.patch2_notification_test_uuid(103));
  insert into public.match_room_assistance values
    ('10000000-0000-4000-8000-000000000001','requested',3,null);

  -- Eighty visible admin rows per tournament; exactly sixty start unread.
  insert into public.notifications(id,recipient_role,type,title,message,tournament_id,
    tournament_title,registration_id,match_id,event_key,metadata,read_at,created_at)
  select public.patch2_notification_test_uuid(t*1000+i),'admin',
    case when t=1 and i in (1,3,4,5,6) then 'match.admin_assistance_requested' else 'registration.submitted' end,
    'Local admin notice '||i,'Synthetic message',public.patch2_notification_test_uuid(t),
    'Local tournament '||t,public.patch2_notification_test_uuid(100+t),public.patch2_notification_test_uuid(200+t),
    case when t=1 and i in (1,5) then null
      when t=1 and i in (3,6) then 'match-room:10000000-0000-4000-8000-000000000001:assistance:'||i
      else 'local-event:'||t||':'||i end,
    case when t=1 and i in (3,4,6) then '{"roomId":"10000000-0000-4000-8000-000000000001"}'::jsonb
      when t=1 and i=5 then '{"roomId":"malformed-old-hint"}'::jsonb
      when t=1 and i=2 then '{"adminInboxScope":"platform"}'::jsonb else '{}'::jsonb end,
    case when i%4=0 then '2026-02-01Z'::timestamptz else null end,
    '2026-01-01Z'::timestamptz+(i||' minutes')::interval
  from generate_series(1,2)t cross join generate_series(1,80)i;
  insert into public.notifications(id,recipient_role,type,title,message,tournament_id,
    created_at,in_app_hidden_at) values
    (public.patch2_notification_test_uuid(1090),'admin','match.admin_assistance_requested',
      'Hidden legacy request','Its old dismissal does not prove resolution',public.patch2_notification_test_uuid(1),'2025-01-01Z','2025-01-02Z');
  insert into public.notifications(id,recipient_role,type,title,message,registration_id,metadata) values
    (public.patch2_notification_test_uuid(3001),'admin','match.admin_assistance_requested','Unassigned legacy','Keep association unknown',public.patch2_notification_test_uuid(101),'{}'),
    (public.patch2_notification_test_uuid(3002),'admin','registration.submitted','Unassigned registration','Do not infer from registration',public.patch2_notification_test_uuid(101),'{}'),
    (public.patch2_notification_test_uuid(3003),'admin','platform.other','Unassigned unknown flag','Keep unassigned',null,'{"adminInboxScope":"unknown"}'),
    (public.patch2_notification_test_uuid(4001),'admin','platform.health','Platform one','Explicit platform flag',null,'{"adminInboxScope":"platform"}'),
    (public.patch2_notification_test_uuid(4002),'admin','platform.health','Platform two','Explicit platform flag',null,'{"adminInboxScope":"platform"}');
  insert into public.notifications(id,recipient_clerk_user_id,recipient_role,type,title,message,tournament_id,registration_id) values
    (public.patch2_notification_test_uuid(5001),'local_same_player','player','registration.approved','Player notice','Owned by player',public.patch2_notification_test_uuid(1),public.patch2_notification_test_uuid(101)),
    (public.patch2_notification_test_uuid(5002),'local_same_player','admin','platform.audit','Hybrid admin notice','Admin scope takes priority',null,null);
  -- Only this historical noncanonical notice was transferred to room authority.
  update public.match_room_assistance set notification_id=public.patch2_notification_test_uuid(1004);
end;
$$;
select public.patch2_seed_notifications();
