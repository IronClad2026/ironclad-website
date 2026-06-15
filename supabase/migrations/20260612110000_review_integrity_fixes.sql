begin;

alter table public.tournament_deletion_jobs
  add column if not exists banner_paths text[]
  not null default array[]::text[];

create or replace function public.is_elo_eligible(
  p_current_elo integer,
  p_elo_rules text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_rule text;
  v_match text[];
  v_minimum integer;
  v_maximum integer;
begin
  if p_current_elo is null or p_elo_rules is null then
    return null;
  end if;

  v_rule := lower(
    btrim(
      regexp_replace(
        replace(
          replace(
            replace(p_elo_rules, ',', ''),
            chr(8211),
            '-'
          ),
          chr(8212),
          '-'
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  );

  if v_rule in (
    'open',
    'any elo',
    'all elo',
    'all ratings',
    'no elo restriction',
    'unrestricted'
  ) then
    return true;
  end if;

  v_match := regexp_match(
    v_rule,
    '([0-9]+)[[:space:]]*(-|to|through)[[:space:]]*([0-9]+)'
  );
  if v_match is not null then
    v_minimum := v_match[1]::integer;
    v_maximum := v_match[3]::integer;
    if v_minimum > v_maximum then
      return null;
    end if;
    return p_current_elo between v_minimum and v_maximum;
  end if;

  v_match := regexp_match(
    v_rule,
    '(>=|at least|minimum|min)[[:space:]]*(elo[[:space:]]*)?([0-9]+)'
  );
  if v_match is not null then
    return p_current_elo >= v_match[3]::integer;
  end if;

  v_match := regexp_match(
    v_rule,
    '([0-9]+)[[:space:]]*(\+|and (above|higher)|or (above|higher))'
  );
  if v_match is not null then
    return p_current_elo >= v_match[1]::integer;
  end if;

  v_match := regexp_match(
    v_rule,
    '(>|above|over)[[:space:]]*(elo[[:space:]]*)?([0-9]+)'
  );
  if v_match is not null then
    return p_current_elo > v_match[3]::integer;
  end if;

  v_match := regexp_match(
    v_rule,
    '(<=|at most|maximum|max)[[:space:]]*(elo[[:space:]]*)?([0-9]+)'
  );
  if v_match is not null then
    return p_current_elo <= v_match[3]::integer;
  end if;

  v_match := regexp_match(
    v_rule,
    '([0-9]+)[[:space:]]*(and (below|under)|or (below|under))'
  );
  if v_match is not null then
    return p_current_elo <= v_match[1]::integer;
  end if;

  v_match := regexp_match(
    v_rule,
    '(<|below|under|less than)[[:space:]]*(elo[[:space:]]*)?([0-9]+)'
  );
  if v_match is not null then
    return p_current_elo < v_match[3]::integer;
  end if;

  return null;
end;
$$;

create or replace function public.enforce_registration_elo_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_elo integer;
  v_bracket_name text;
  v_elo_rules text;
  v_is_eligible boolean;
begin
  if new.registration_status = 'rejected' then
    return new;
  end if;

  if new.tournament_bracket_id is null or new.clerk_user_id is null then
    return new;
  end if;

  select player.current_elo, bracket.name, bracket.elo_rules
  into v_current_elo, v_bracket_name, v_elo_rules
  from public.players as player
  cross join public.tournament_brackets as bracket
  where player.clerk_user_id = new.clerk_user_id
    and bracket.id = new.tournament_bracket_id;

  if not found or v_current_elo is null then
    raise exception 'A completed player profile with current ELO is required';
  end if;

  v_is_eligible := public.is_elo_eligible(v_current_elo, v_elo_rules);

  if v_is_eligible is null then
    raise exception
      'The % Bracket has an invalid ELO rule configuration: %',
      v_bracket_name,
      v_elo_rules;
  end if;

  if not v_is_eligible then
    raise exception
      'Saved ELO % does not satisfy the % Bracket requirement: %',
      v_current_elo,
      v_bracket_name,
      v_elo_rules;
  end if;

  new.submitted_elo = v_current_elo;
  return new;
end;
$$;

create or replace function public.validate_tournament_bracket_elo_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_elo_eligible(0, new.elo_rules) is null then
    raise exception
      'Invalid ELO rule configuration for the % Bracket: %',
      new.name,
      new.elo_rules;
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_brackets_validate_elo_rules
  on public.tournament_brackets;
create trigger tournament_brackets_validate_elo_rules
before insert or update of elo_rules
on public.tournament_brackets
for each row
execute function public.validate_tournament_bracket_elo_rules();

drop trigger if exists registrations_enforce_elo_eligibility
  on public.registrations;
create trigger registrations_enforce_elo_eligibility
before insert or update of
  clerk_user_id,
  tournament_bracket_id,
  registration_status
on public.registrations
for each row
execute function public.enforce_registration_elo_eligibility();

create or replace function public.protect_reported_match_participants()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('ironclad.explicit_match_reset', true) = 'on' then
    return new;
  end if;

  if (
    (
      old.player_one_registration_id is not null
      and old.player_one_registration_id is distinct from
        new.player_one_registration_id
    )
    or (
      old.player_two_registration_id is not null
      and old.player_two_registration_id is distinct from
        new.player_two_registration_id
    )
  )
  and (
    old.status <> 'scheduled'
    or old.player_one_score is not null
    or old.player_two_score is not null
    or old.winner_registration_id is not null
    or old.official_result_submission_id is not null
    or old.official_result_decided_by is not null
    or old.official_result_decided_at is not null
    or exists (
      select 1
      from public.match_result_submissions as submission
      where submission.match_id = old.id
    )
  ) then
    raise exception
      'Winner correction blocked because the downstream match already has review activity, submissions, proof, or an official result. Use an explicit match reset workflow before changing its participants.';
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_matches_protect_reported_participants
  on public.tournament_matches;
create trigger tournament_matches_protect_reported_participants
before update of
  player_one_registration_id,
  player_two_registration_id
on public.tournament_matches
for each row
execute function public.protect_reported_match_participants();

create or replace function public.get_tournament_deletion_preview(
  p_tournament_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with target_brackets as (
    select id
    from public.tournament_brackets
    where tournament_id = p_tournament_id
  ),
  target_generated as (
    select id
    from public.generated_brackets
    where tournament_bracket_id in (select id from target_brackets)
  ),
  target_matches as (
    select id
    from public.tournament_matches
    where generated_bracket_id in (select id from target_generated)
  ),
  target_submissions as (
    select replay_storage_path, screenshot_storage_path
    from public.match_result_submissions
    where match_id in (select id from target_matches)
  ),
  storage_paths as (
    select replay_storage_path as path from target_submissions
    union
    select screenshot_storage_path as path from target_submissions
    union
    select banner_image_url
    from public.tournaments
    where id = p_tournament_id
      and banner_image_url like
        '%/storage/v1/object/public/tournament-banners/%'
  )
  select jsonb_build_object(
    'registrations', (
      select count(*)
      from public.registrations
      where tournament_id = p_tournament_id
        or tournament_bracket_id in (select id from target_brackets)
    ),
    'brackets', (select count(*) from target_brackets),
    'generated_brackets', (select count(*) from target_generated),
    'rounds', (
      select count(*)
      from public.bracket_rounds
      where generated_bracket_id in (select id from target_generated)
    ),
    'matches', (select count(*) from target_matches),
    'standings', (
      select count(*)
      from public.tournament_standings
      where generated_bracket_id in (select id from target_generated)
    ),
    'result_submissions', (select count(*) from target_submissions),
    'storage_files', (
      select count(*)
      from storage_paths
      where path is not null
    )
  );
$$;

create or replace function public.delete_tournament_data(
  p_tournament_id uuid,
  p_deleted_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_title text;
  v_banner_image_url text;
  v_banner_path text;
  v_banner_paths text[] := array[]::text[];
  v_counts jsonb;
  v_proof_paths text[];
  v_job_id uuid;
  v_banner_marker constant text :=
    '/storage/v1/object/public/tournament-banners/';
begin
  if p_deleted_by is null or btrim(p_deleted_by) = '' then
    raise exception 'Deleting administrator is required';
  end if;

  select title, banner_image_url
  into v_tournament_title, v_banner_image_url
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  if position(v_banner_marker in coalesce(v_banner_image_url, '')) > 0 then
    v_banner_path := split_part(
      split_part(v_banner_image_url, v_banner_marker, 2),
      '?',
      1
    );
    if v_banner_path <> '' then
      v_banner_paths := array[v_banner_path];
    end if;
  end if;

  v_counts := public.get_tournament_deletion_preview(p_tournament_id);

  select coalesce(array_agg(distinct proof.path), array[]::text[])
  into v_proof_paths
  from (
    select submission.replay_storage_path as path
    from public.match_result_submissions as submission
    join public.tournament_matches as match
      on match.id = submission.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and submission.replay_storage_path is not null
    union all
    select submission.screenshot_storage_path as path
    from public.match_result_submissions as submission
    join public.tournament_matches as match
      on match.id = submission.match_id
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
      and submission.screenshot_storage_path is not null
  ) as proof;

  insert into public.tournament_deletion_jobs (
    tournament_id,
    tournament_title,
    requested_by,
    proof_paths,
    banner_paths,
    deleted_counts
  )
  values (
    p_tournament_id,
    v_tournament_title,
    p_deleted_by,
    v_proof_paths,
    v_banner_paths,
    v_counts
  )
  returning id into v_job_id;

  perform set_config('ironclad.tournament_deletion', 'on', true);

  delete from public.match_result_submissions
  where match_id in (
    select match.id
    from public.tournament_matches as match
    join public.generated_brackets as generated
      on generated.id = match.generated_bracket_id
    join public.tournament_brackets as bracket
      on bracket.id = generated.tournament_bracket_id
    where bracket.tournament_id = p_tournament_id
  );

  delete from public.generated_brackets
  where tournament_bracket_id in (
    select id
    from public.tournament_brackets
    where tournament_id = p_tournament_id
  );

  delete from public.registrations
  where tournament_id = p_tournament_id
    or tournament_bracket_id in (
      select id
      from public.tournament_brackets
      where tournament_id = p_tournament_id
    );

  delete from public.tournament_brackets
  where tournament_id = p_tournament_id;

  delete from public.tournaments
  where id = p_tournament_id;

  if not found then
    raise exception 'Tournament deletion did not remove the tournament';
  end if;

  return jsonb_build_object(
    'job_id', v_job_id,
    'tournament_title', v_tournament_title,
    'proof_paths', to_jsonb(v_proof_paths),
    'banner_paths', to_jsonb(v_banner_paths),
    'deleted_counts', v_counts
  );
end;
$$;

revoke all on function public.is_elo_eligible(integer, text)
  from public;
grant execute on function public.is_elo_eligible(integer, text)
  to service_role;

revoke all on function public.get_tournament_deletion_preview(uuid)
  from public;
grant execute on function public.get_tournament_deletion_preview(uuid)
  to service_role;

revoke all on function public.delete_tournament_data(uuid, text)
  from public;
grant execute on function public.delete_tournament_data(uuid, text)
  to service_role;

commit;
