begin;

create table if not exists public.generated_brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_bracket_id uuid not null
    references public.tournament_brackets(id) on delete cascade,
  format text not null
    check (format in ('single_elimination', 'round_robin')),
  participant_count integer not null check (participant_count >= 2),
  generated_by text not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_bracket_id)
);

create table if not exists public.bracket_rounds (
  id uuid primary key default gen_random_uuid(),
  generated_bracket_id uuid not null
    references public.generated_brackets(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  name text not null,
  created_at timestamptz not null default now(),
  unique (generated_bracket_id, round_number)
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  generated_bracket_id uuid not null
    references public.generated_brackets(id) on delete cascade,
  round_id uuid not null
    references public.bracket_rounds(id) on delete cascade,
  match_number integer not null check (match_number >= 1),
  player_one_registration_id uuid
    references public.registrations(id) on delete set null,
  player_two_registration_id uuid
    references public.registrations(id) on delete set null,
  player_one_score integer,
  player_two_score integer,
  winner_registration_id uuid
    references public.registrations(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, match_number)
);

create table if not exists public.tournament_standings (
  id uuid primary key default gen_random_uuid(),
  generated_bracket_id uuid not null
    references public.generated_brackets(id) on delete cascade,
  registration_id uuid not null
    references public.registrations(id) on delete cascade,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  points integer not null default 0,
  rank integer check (rank is null or rank >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (generated_bracket_id, registration_id)
);

create index if not exists generated_brackets_tournament_bracket_idx
  on public.generated_brackets(tournament_bracket_id);
create index if not exists bracket_rounds_generated_bracket_idx
  on public.bracket_rounds(generated_bracket_id, round_number);
create index if not exists tournament_matches_generated_bracket_idx
  on public.tournament_matches(generated_bracket_id, round_id);
create index if not exists tournament_standings_generated_bracket_idx
  on public.tournament_standings(generated_bracket_id, rank);

drop trigger if exists generated_brackets_set_updated_at
  on public.generated_brackets;
create trigger generated_brackets_set_updated_at
before update on public.generated_brackets
for each row execute function public.ironclad_set_updated_at();

drop trigger if exists tournament_matches_set_updated_at
  on public.tournament_matches;
create trigger tournament_matches_set_updated_at
before update on public.tournament_matches
for each row execute function public.ironclad_set_updated_at();

drop trigger if exists tournament_standings_set_updated_at
  on public.tournament_standings;
create trigger tournament_standings_set_updated_at
before update on public.tournament_standings
for each row execute function public.ironclad_set_updated_at();

create or replace function public.enforce_registration_elo_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_elo integer;
  v_bracket_name text;
begin
  if new.tournament_bracket_id is null or new.clerk_user_id is null then
    return new;
  end if;

  select player.current_elo, bracket.name
  into v_current_elo, v_bracket_name
  from public.players as player
  cross join public.tournament_brackets as bracket
  where player.clerk_user_id = new.clerk_user_id
    and bracket.id = new.tournament_bracket_id;

  if not found or v_current_elo is null then
    raise exception 'A completed player profile with current ELO is required';
  end if;

  if (v_current_elo >= 1300 and v_bracket_name <> 'Main')
    or (v_current_elo < 1300 and v_bracket_name <> 'Challenge') then
    raise exception 'Saved ELO is eligible for the % Bracket only',
      case when v_current_elo >= 1300 then 'Main' else 'Challenge' end;
  end if;

  new.submitted_elo = v_current_elo;
  return new;
end;
$$;

drop trigger if exists registrations_enforce_elo_eligibility
  on public.registrations;
create trigger registrations_enforce_elo_eligibility
before insert or update of clerk_user_id, tournament_bracket_id
on public.registrations
for each row
execute function public.enforce_registration_elo_eligibility();

create or replace function public.generate_tournament_bracket(
  p_tournament_bracket_id uuid,
  p_generated_by text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bracket_id uuid;
  v_bracket_name text;
  v_participants uuid[];
  v_participant_count integer;
  v_invalid_count integer;
  v_format text;
  v_generated_bracket_id uuid;
  v_round_id uuid;
  v_round_count integer;
  v_round_number integer;
  v_match_count integer;
  v_match_number integer;
  v_round_name text;
  v_first_index integer;
  v_second_index integer;
begin
  if p_generated_by is null or btrim(p_generated_by) = '' then
    raise exception 'Generating administrator is required';
  end if;

  select id, name
  into v_bracket_id, v_bracket_name
  from public.tournament_brackets
  where id = p_tournament_bracket_id
  for update;

  if not found then
    raise exception 'Tournament bracket not found';
  end if;

  select
    array_agg(registration.id order by random()),
    count(*)::integer
  into v_participants, v_participant_count
  from public.registrations as registration
  where registration.tournament_bracket_id = p_tournament_bracket_id
    and registration.registration_status = 'approved';

  if v_participant_count < 2 then
    raise exception 'At least two approved participants are required';
  end if;

  select count(*)::integer
  into v_invalid_count
  from public.registrations as registration
  left join public.players as player
    on player.clerk_user_id = registration.clerk_user_id
  where registration.tournament_bracket_id = p_tournament_bracket_id
    and registration.registration_status = 'approved'
    and (
      player.current_elo is null
      or (player.current_elo >= 1300 and v_bracket_name <> 'Main')
      or (player.current_elo < 1300 and v_bracket_name <> 'Challenge')
    );

  if v_invalid_count > 0 then
    raise exception
      'Approved participants must satisfy current profile ELO eligibility';
  end if;

  v_format := case
    when v_participant_count in (8, 16, 32)
      then 'single_elimination'
    else 'round_robin'
  end;

  delete from public.generated_brackets
  where tournament_bracket_id = p_tournament_bracket_id;

  insert into public.generated_brackets (
    tournament_bracket_id,
    format,
    participant_count,
    generated_by
  )
  values (
    p_tournament_bracket_id,
    v_format,
    v_participant_count,
    p_generated_by
  )
  returning id into v_generated_bracket_id;

  if v_format = 'single_elimination' then
    v_round_count := log(2, v_participant_count)::integer;

    for v_round_number in 1..v_round_count loop
      v_match_count :=
        v_participant_count / power(2, v_round_number)::integer;
      v_round_name := case
        when v_match_count = 1 then 'Final'
        when v_match_count = 2 then 'Semifinals'
        when v_match_count = 4 then 'Quarterfinals'
        else 'Round of ' || (v_match_count * 2)::text
      end;

      insert into public.bracket_rounds (
        generated_bracket_id,
        round_number,
        name
      )
      values (
        v_generated_bracket_id,
        v_round_number,
        v_round_name
      )
      returning id into v_round_id;

      for v_match_number in 1..v_match_count loop
        v_first_index := ((v_match_number - 1) * 2) + 1;
        v_second_index := v_first_index + 1;

        insert into public.tournament_matches (
          generated_bracket_id,
          round_id,
          match_number,
          player_one_registration_id,
          player_two_registration_id
        )
        values (
          v_generated_bracket_id,
          v_round_id,
          v_match_number,
          case
            when v_round_number = 1 then v_participants[v_first_index]
            else null
          end,
          case
            when v_round_number = 1 then v_participants[v_second_index]
            else null
          end
        );
      end loop;
    end loop;
  else
    insert into public.bracket_rounds (
      generated_bracket_id,
      round_number,
      name
    )
    values (v_generated_bracket_id, 1, 'Round Robin')
    returning id into v_round_id;

    v_match_number := 0;
    for v_first_index in 1..(v_participant_count - 1) loop
      for v_second_index in (v_first_index + 1)..v_participant_count loop
        v_match_number := v_match_number + 1;
        insert into public.tournament_matches (
          generated_bracket_id,
          round_id,
          match_number,
          player_one_registration_id,
          player_two_registration_id
        )
        values (
          v_generated_bracket_id,
          v_round_id,
          v_match_number,
          v_participants[v_first_index],
          v_participants[v_second_index]
        );
      end loop;
    end loop;

    insert into public.tournament_standings (
      generated_bracket_id,
      registration_id
    )
    select v_generated_bracket_id, unnest(v_participants);
  end if;

  return v_generated_bracket_id;
end;
$$;

revoke all on function public.generate_tournament_bracket(uuid, text)
  from public;
grant execute on function public.generate_tournament_bracket(uuid, text)
  to service_role;

alter table public.generated_brackets enable row level security;
alter table public.bracket_rounds enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_standings enable row level security;

drop policy if exists "Public can read generated brackets"
  on public.generated_brackets;
create policy "Public can read generated brackets"
on public.generated_brackets for select to anon, authenticated using (true);

drop policy if exists "Public can read bracket rounds"
  on public.bracket_rounds;
create policy "Public can read bracket rounds"
on public.bracket_rounds for select to anon, authenticated using (true);

drop policy if exists "Public can read tournament matches"
  on public.tournament_matches;
create policy "Public can read tournament matches"
on public.tournament_matches for select to anon, authenticated using (true);

drop policy if exists "Public can read tournament standings"
  on public.tournament_standings;
create policy "Public can read tournament standings"
on public.tournament_standings for select to anon, authenticated using (true);

grant select on public.generated_brackets to anon, authenticated;
grant select on public.bracket_rounds to anon, authenticated;
grant select on public.tournament_matches to anon, authenticated;
grant select on public.tournament_standings to anon, authenticated;

commit;
