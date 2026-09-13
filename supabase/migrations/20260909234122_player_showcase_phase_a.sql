begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $preconditions$
begin
  if pg_catalog.current_setting('server_version_num')::integer < 150000 then
    raise exception 'Player Showcase requires PostgreSQL 15 or later'
      using errcode = '0A000';
  end if;
  if pg_catalog.current_setting('server_encoding') <> 'UTF8' then
    raise exception 'Player Showcase requires UTF8'
      using errcode = '0A000';
  end if;
end;
$preconditions$;

insert into public.platform_settings (key, value)
values ('player_showcase', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create function public.player_showcase_enabled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select setting.value -> 'enabled' = 'true'::jsonb
    from public.platform_settings as setting
    where setting.key = 'player_showcase'
  ), false);
$$;

alter function public.player_showcase_enabled() owner to postgres;
revoke all on function public.player_showcase_enabled()
  from public, anon, authenticated, service_role;
grant execute on function public.player_showcase_enabled()
  to anon, authenticated, service_role;

-- Match JavaScript NFC, line/tab replacement, and String.trim whitespace.
-- Reject remaining control and bidi override/isolate characters before trim:
-- forbidden leading/trailing controls must not disappear during normalization.
create function ironclad_private.normalize_player_showcase_thought(p_value text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_value text;
  v_trim_characters text :=
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if p_value is null then
    return null;
  end if;
  v_value := pg_catalog.translate(
    normalize(p_value, NFC),
    U&'\0009\000A\000D\2028\2029',
    '     '
  );
  if v_value ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F\202A-\202E\2066-\2069]' then
    raise exception 'Invalid Showcase thought'
      using errcode = '22023';
  end if;
  v_value := nullif(pg_catalog.btrim(v_value, v_trim_characters), '');
  if pg_catalog.char_length(v_value) > 160 then
    raise exception 'Invalid Showcase thought'
      using errcode = '22023';
  end if;
  return v_value;
end;
$$;

alter function ironclad_private.normalize_player_showcase_thought(text)
  owner to postgres;
revoke all on function ironclad_private.normalize_player_showcase_thought(text)
  from public, anon, authenticated, service_role;

-- This is a presentation allowlist, not a new award authority. Contract tests
-- keep it aligned with lib/badges/catalog.ts. Unknown stored slugs fail closed.
create function ironclad_private.player_showcase_badge_slug_allowed(p_slug text)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select p_slug = any (array[
    'ironclad-recruit', 'first-deployment', 'first-victory', 'battle-tested',
    'rising-through-the-ranks', 'first-campaign', 'iron-regular',
    'tournament-veteran', 'season-campaigner', 'reliable-competitor',
    'five-victories', 'ten-victories', 'twenty-five-victories', 'iron-streak',
    'unbroken', 'clean-sweep', 'comeback-commander', 'giant-slayer',
    'giant-hunter', 'flawless-campaign', 'first-advance', 'semifinalist',
    'finalist', 'academy-champion', 'challenge-champion', 'elite-champion',
    'double-champion', 'triple-crown', 'season-podium', 'season-champion'
  ]::text[]);
$$;

alter function ironclad_private.player_showcase_badge_slug_allowed(text)
  owner to postgres;
revoke all on function ironclad_private.player_showcase_badge_slug_allowed(text)
  from public, anon, authenticated, service_role;

create table public.player_showcases (
  player_id uuid primary key
    references public.players(id) on delete cascade,
  current_thought text,
  featured_badge_award_id uuid,
  thought_hidden_at timestamptz,
  thought_moderated_by_clerk_user_id text,
  revision bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint player_showcases_thought_check check (
    current_thought is null
    or (
      current_thought is not distinct from
        ironclad_private.normalize_player_showcase_thought(current_thought)
      and pg_catalog.char_length(current_thought) between 1 and 160
    )
  ),
  constraint player_showcases_revision_check
    check (revision between 1 and 9007199254740991),
  constraint player_showcases_owned_award_fk
    foreign key (featured_badge_award_id, player_id)
    references public.player_badge_awards(id, player_id)
    on delete set null (featured_badge_award_id)
);

create index player_showcases_featured_award_idx
  on public.player_showcases(featured_badge_award_id)
  where featured_badge_award_id is not null;

alter table public.player_showcases enable row level security;
alter table public.player_showcases force row level security;
revoke all on table public.player_showcases
  from public, anon, authenticated, service_role;
grant select on table public.player_showcases to service_role;
grant select (
  player_id, current_thought, featured_badge_award_id, thought_hidden_at,
  revision, created_at, updated_at
) on public.player_showcases to authenticated;

create policy "Players can read their own Showcase"
on public.player_showcases
for select
to authenticated
using (
  exists (
    select 1
    from public.players as player
    where player.id = player_showcases.player_id
      and player.clerk_user_id = (auth.jwt() ->> 'sub')
      and player.account_closed_at is null
  )
);

create function ironclad_private.track_player_showcase_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    if new.player_id is distinct from old.player_id then
      raise exception 'Showcase ownership is immutable'
        using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    if new.current_thought is distinct from old.current_thought
      or new.featured_badge_award_id is distinct from old.featured_badge_award_id
      or new.thought_hidden_at is distinct from old.thought_hidden_at then
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

alter function ironclad_private.track_player_showcase_revision()
  owner to postgres;
revoke all on function ironclad_private.track_player_showcase_revision()
  from public, anon, authenticated, service_role;

create trigger player_showcases_track_revision
before insert or update on public.player_showcases
for each row execute function ironclad_private.track_player_showcase_revision();

create function ironclad_private.player_showcase_owner_state(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'player_id', player.id,
    'current_thought', showcase.current_thought,
    'featured_badge_award_id', showcase.featured_badge_award_id,
    'thought_hidden_at', showcase.thought_hidden_at,
    'revision', coalesce(showcase.revision, 0),
    'updated_at', showcase.updated_at
  )
  from public.players as player
  left join public.player_showcases as showcase on showcase.player_id = player.id
  where player.id = p_player_id
    and player.account_closed_at is null;
$$;

alter function ironclad_private.player_showcase_owner_state(uuid)
  owner to postgres;
revoke all on function ironclad_private.player_showcase_owner_state(uuid)
  from public, anon, authenticated, service_role;

-- Mirrors the latest current-effective account document contract. The
-- application additionally checks its approved deployed legal corpus/origins.
-- Document locks prevent publication changes during the content transaction.
create function ironclad_private.player_showcase_has_current_legal_acceptance(
  p_clerk_user_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_document public.legal_documents%rowtype;
  v_terms_id uuid;
  v_privacy_id uuid;
  v_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  for v_document in
    select document.*
    from public.legal_documents as document
    where document.document_kind in ('terms', 'privacy')
      and document.status = 'effective'
      and document.published_at is not null
      and document.published_at <= v_now
      and document.effective_at is not null
      and document.effective_at <= v_now
      and document.sha256 is not null
    order by document.document_kind
    for share
  loop
    v_count := v_count + 1;
    if v_document.document_kind = 'terms' then
      v_terms_id := v_document.id;
    else
      v_privacy_id := v_document.id;
    end if;
  end loop;

  return v_count = 2 and exists (
    select 1
    from public.account_legal_acceptances as acceptance
    where acceptance.clerk_user_id = p_clerk_user_id
      and acceptance.terms_document_id = v_terms_id
      and acceptance.privacy_document_id = v_privacy_id
      and acceptance.terms_accepted is true
      and acceptance.privacy_acknowledged is true
  );
end;
$$;

alter function ironclad_private.player_showcase_has_current_legal_acceptance(text)
  owner to postgres;
revoke all on function ironclad_private.player_showcase_has_current_legal_acceptance(text)
  from public, anon, authenticated, service_role;

create function public.get_my_player_showcase()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(auth.jwt() ->> 'sub'), '');
  v_player_id uuid;
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or v_clerk_user_id is null then
    raise exception 'Showcase authentication is required'
      using errcode = '42501';
  end if;
  select player.id into v_player_id
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
    and player.account_closed_at is null;
  return ironclad_private.player_showcase_owner_state(v_player_id);
end;
$$;

alter function public.get_my_player_showcase() owner to postgres;
revoke all on function public.get_my_player_showcase()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_player_showcase() to authenticated;

-- Both field-specific RPCs share the same parent-row lock. Revision zero is
-- the virtual absent row, so simultaneous first saves cannot overwrite each
-- other. Badge locks precede Showcase locks to avoid a reversed dependency on
-- the award FK's ON DELETE SET NULL update.
create function ironclad_private.save_my_player_showcase_field(
  p_field text,
  p_current_thought text,
  p_award_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(auth.jwt() ->> 'sub'), '');
  v_player_id uuid;
  v_showcase public.player_showcases%rowtype;
  v_state jsonb;
  v_thought text;
  v_award_slug text;
  v_award_valid boolean := true;
  v_code text;
begin
  if coalesce(auth.role(), '') <> 'authenticated'
    or v_clerk_user_id is null then
    raise exception 'Showcase authentication is required'
      using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 0
    or p_expected_revision > 9007199254740991
    or p_field not in ('thought', 'badge') then
    return jsonb_build_object('code', 'invalid-input', 'showcase', null);
  end if;

  select player.id into v_player_id
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
    and player.account_closed_at is null
  for update;

  if v_player_id is null then
    return jsonb_build_object('code', 'profile-required', 'showcase', null);
  end if;

  if p_field = 'badge' and p_award_id is not null then
    select award.badge_slug into v_award_slug
    from public.player_badge_awards as award
    where award.id = p_award_id
      and award.player_id = v_player_id
    for key share;
    v_award_valid := found and coalesce(
      ironclad_private.player_showcase_badge_slug_allowed(v_award_slug), false
    );
  end if;

  select showcase.* into v_showcase
  from public.player_showcases as showcase
  where showcase.player_id = v_player_id
  for update;
  v_state := ironclad_private.player_showcase_owner_state(v_player_id);

  if coalesce(v_showcase.revision, 0) <> p_expected_revision then
    return jsonb_build_object('code', 'conflict', 'showcase', v_state);
  end if;

  if p_field = 'thought' then
    begin
      v_thought :=
        ironclad_private.normalize_player_showcase_thought(p_current_thought);
    exception when invalid_parameter_value then
      return jsonb_build_object('code', 'invalid-thought', 'showcase', v_state);
    end;
    if v_thought is not distinct from v_showcase.current_thought then
      return jsonb_build_object('code', 'saved', 'showcase', v_state);
    end if;
  else
    if not v_award_valid then
      return jsonb_build_object('code', 'invalid-badge', 'showcase', v_state);
    end if;
    if p_award_id is not distinct from v_showcase.featured_badge_award_id then
      return jsonb_build_object('code', 'saved', 'showcase', v_state);
    end if;
  end if;

  -- Clearing either field is always available, including feature shutdown,
  -- legal-gate outages, and moderation holds. Owner edits never clear a hold.
  if (p_field = 'thought' and v_thought is not null)
    or (p_field = 'badge' and p_award_id is not null) then
    if not public.player_showcase_enabled() then
      v_code := 'feature-disabled';
    elsif not ironclad_private.player_showcase_has_current_legal_acceptance(
      v_clerk_user_id
    ) then
      v_code := 'legal-required';
    end if;
    if v_code is not null then
      return jsonb_build_object('code', v_code, 'showcase', v_state);
    end if;
  end if;

  if v_showcase.player_id is null then
    insert into public.player_showcases (
      player_id, current_thought, featured_badge_award_id
    )
    values (
      v_player_id,
      case when p_field = 'thought' then v_thought else null end,
      case when p_field = 'badge' then p_award_id else null end
    );
  elsif p_field = 'thought' then
    update public.player_showcases
    set current_thought = v_thought
    where player_id = v_player_id;
  else
    update public.player_showcases
    set featured_badge_award_id = p_award_id
    where player_id = v_player_id;
  end if;

  return jsonb_build_object(
    'code', 'saved',
    'showcase', ironclad_private.player_showcase_owner_state(v_player_id)
  );
end;
$$;

alter function ironclad_private.save_my_player_showcase_field(text, text, uuid, bigint)
  owner to postgres;
revoke all on function ironclad_private.save_my_player_showcase_field(text, text, uuid, bigint)
  from public, anon, authenticated, service_role;

create function public.save_my_player_showcase_thought(
  p_current_thought text,
  p_expected_revision bigint
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select ironclad_private.save_my_player_showcase_field(
    'thought', p_current_thought, null, p_expected_revision
  );
$$;

create function public.save_my_player_showcase_badge(
  p_award_id uuid,
  p_expected_revision bigint
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select ironclad_private.save_my_player_showcase_field(
    'badge', null, p_award_id, p_expected_revision
  );
$$;

alter function public.save_my_player_showcase_thought(text, bigint)
  owner to postgres;
alter function public.save_my_player_showcase_badge(uuid, bigint)
  owner to postgres;
revoke all on function public.save_my_player_showcase_thought(text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.save_my_player_showcase_badge(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.save_my_player_showcase_thought(text, bigint)
  to authenticated;
grant execute on function public.save_my_player_showcase_badge(uuid, bigint)
  to authenticated;

create function public.moderate_player_showcase_thought(
  p_player_id uuid,
  p_hidden boolean,
  p_actor_clerk_user_id text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid;
  v_showcase public.player_showcases%rowtype;
  v_state jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Showcase moderation requires the trusted server boundary'
      using errcode = '42501';
  end if;

  -- The calling Server Action must independently verify Clerk Admin metadata.
  -- Service credentials are the trusted boundary, not an actor-ID assertion.
  if p_hidden is null
    or nullif(btrim(p_actor_clerk_user_id), '') is null
    or length(p_actor_clerk_user_id) > 255
    or p_expected_revision is null or p_expected_revision < 0
    or p_expected_revision > 9007199254740991 then
    return jsonb_build_object('code', 'invalid-input', 'showcase', null);
  end if;

  select player.id into v_player_id
  from public.players as player
  where player.id = p_player_id
    and player.account_closed_at is null
  for update;
  if v_player_id is null then
    return jsonb_build_object('code', 'profile-required', 'showcase', null);
  end if;

  select showcase.* into v_showcase
  from public.player_showcases as showcase
  where showcase.player_id = v_player_id
  for update;
  v_state := ironclad_private.player_showcase_owner_state(v_player_id);

  if coalesce(v_showcase.revision, 0) <> p_expected_revision then
    return jsonb_build_object('code', 'conflict', 'showcase', v_state);
  end if;
  if p_hidden = (v_showcase.thought_hidden_at is not null) then
    return jsonb_build_object('code', 'saved', 'showcase', v_state);
  end if;

  if v_showcase.player_id is null then
    insert into public.player_showcases (
      player_id, thought_hidden_at, thought_moderated_by_clerk_user_id
    )
    values (v_player_id, clock_timestamp(), p_actor_clerk_user_id);
  else
    update public.player_showcases
    set
      thought_hidden_at = case when p_hidden then clock_timestamp() else null end,
      thought_moderated_by_clerk_user_id = p_actor_clerk_user_id
    where player_id = v_player_id;
  end if;

  return jsonb_build_object(
    'code', 'saved',
    'showcase', ironclad_private.player_showcase_owner_state(v_player_id)
  );
end;
$$;

alter function public.moderate_player_showcase_thought(uuid, boolean, text, bigint)
  owner to postgres;
revoke all on function public.moderate_player_showcase_thought(uuid, boolean, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.moderate_player_showcase_thought(uuid, boolean, text, bigint)
  to service_role;

create view public.public_player_showcases
with (security_barrier = true, security_invoker = false)
as
select
  showcase.player_id,
  case when showcase.thought_hidden_at is null
    then showcase.current_thought else null end as current_thought,
  award.badge_slug as featured_badge_slug,
  case when pg_catalog.isfinite(award.unlocked_at)
    then award.unlocked_at else null end as featured_badge_unlocked_at
from public.player_showcases as showcase
join public.players as player on player.id = showcase.player_id
left join public.player_badge_awards as award
  on award.id = showcase.featured_badge_award_id
  and award.player_id = showcase.player_id
  and award.badge_slug = any (array[
    'ironclad-recruit', 'first-deployment', 'first-victory', 'battle-tested',
    'rising-through-the-ranks', 'first-campaign', 'iron-regular',
    'tournament-veteran', 'season-campaigner', 'reliable-competitor',
    'five-victories', 'ten-victories', 'twenty-five-victories', 'iron-streak',
    'unbroken', 'clean-sweep', 'comeback-commander', 'giant-slayer',
    'giant-hunter', 'flawless-campaign', 'first-advance', 'semifinalist',
    'finalist', 'academy-champion', 'challenge-champion', 'elite-champion',
    'double-champion', 'triple-crown', 'season-podium', 'season-champion'
  ]::text[])
where public.player_showcase_enabled()
  and player.public_profile_enabled is true
  and player.account_closed_at is null;

alter view public.public_player_showcases owner to postgres;
revoke all on table public.public_player_showcases
  from public, anon, authenticated, service_role;
grant select on table public.public_player_showcases
  to anon, authenticated, service_role;

-- Preserve the latest announcement -> push -> competition/polls closure chain.
-- Acquire the existing announcement lock before the parent-player lock, just
-- as the previous entrypoint does. Owner writes lock that same parent before
-- first-row creation, so they cannot restore content after account closure.
alter function public.close_ironclad_player_account(text)
  rename to close_ironclad_player_account_without_showcase_cleanup;
revoke all on function public.close_ironclad_player_account_without_showcase_cleanup(text)
  from public, anon, authenticated, service_role;

create function public.close_ironclad_player_account(p_clerk_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_player_id uuid;
begin
  if session_user <> 'postgres'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Account closure requires the trusted server boundary'
      using errcode = '42501';
  end if;
  if v_clerk_user_id is null then
    raise exception 'Authenticated account identity is required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'ironclad:announcement-account:' || v_clerk_user_id, 0
  ));

  select player.id into v_player_id
  from public.players as player
  where player.clerk_user_id = v_clerk_user_id
  for update;

  delete from public.player_showcases
  where player_id = v_player_id;
  update public.player_showcases
  set thought_moderated_by_clerk_user_id = null
  where thought_moderated_by_clerk_user_id = v_clerk_user_id;

  return public.close_ironclad_player_account_without_showcase_cleanup(
    v_clerk_user_id
  );
end;
$$;

alter function public.close_ironclad_player_account(text) owner to postgres;
revoke all on function public.close_ironclad_player_account(text)
  from public, anon, authenticated, service_role;
grant execute on function public.close_ironclad_player_account(text)
  to service_role;

comment on table public.player_showcases is
  'Optional presentation state only. No profile readiness, competition, registration or badge-authority effect. Parent profile visibility remains authoritative.';
comment on column public.player_showcases.thought_hidden_at is
  'Administrator hold on Current Thought only. Owner edits and clears cannot remove the hold; the featured badge remains independently visible.';
comment on view public.public_player_showcases is
  'Narrow owner-rights public projection for active opted-in players when the global feature is enabled. No award IDs, source metadata, Clerk IDs or moderation attribution are exposed.';

commit;
