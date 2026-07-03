alter table public.tournament_brackets
  drop constraint if exists tournament_brackets_name_check;

alter table public.tournament_brackets
  add constraint tournament_brackets_name_check
  check (name in ('Academy', 'Challenge', 'Main'));
