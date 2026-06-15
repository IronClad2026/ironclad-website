begin;

create or replace function public.set_tournament_match_series_format()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_format text;
  v_is_final_round boolean;
begin
  select
    generated.format,
    round.round_number = log(2, generated.slot_count)::integer
  into v_format, v_is_final_round
  from public.bracket_rounds as round
  join public.generated_brackets as generated
    on generated.id = round.generated_bracket_id
  where round.id = new.round_id;

  if not found then
    raise exception 'Tournament match round was not found';
  end if;

  new.series_best_of := case
    when v_format = 'single_elimination' and v_is_final_round then 5
    else 3
  end;

  return new;
end;
$$;

drop trigger if exists tournament_matches_set_series_format
  on public.tournament_matches;
create trigger tournament_matches_set_series_format
before insert or update of round_id
on public.tournament_matches
for each row
execute function public.set_tournament_match_series_format();

update public.tournament_matches as match
set series_best_of = case
  when generated.format = 'single_elimination'
    and round.round_number = log(2, generated.slot_count)::integer
    then 5
  else 3
end
from public.bracket_rounds as round
join public.generated_brackets as generated
  on generated.id = round.generated_bracket_id
where round.id = match.round_id;

commit;
