alter table public.leaderboard_point_events
  drop constraint if exists leaderboard_point_events_bracket_type_check;

alter table public.leaderboard_point_events
  add constraint leaderboard_point_events_bracket_type_check
  check (bracket_type in ('academy', 'challenge', 'main', 'overall'));

alter table public.leaderboard_player_season_stats
  drop constraint if exists leaderboard_player_season_stats_bracket_type_check;

alter table public.leaderboard_player_season_stats
  add constraint leaderboard_player_season_stats_bracket_type_check
  check (bracket_type in ('academy', 'challenge', 'main', 'overall'));

alter table public.leaderboard_player_all_time_stats
  drop constraint if exists leaderboard_player_all_time_stats_bracket_type_check;

alter table public.leaderboard_player_all_time_stats
  add constraint leaderboard_player_all_time_stats_bracket_type_check
  check (bracket_type in ('academy', 'challenge', 'main', 'overall'));

alter table public.leaderboard_season_champions
  drop constraint if exists leaderboard_season_champions_bracket_type_check;

alter table public.leaderboard_season_champions
  add constraint leaderboard_season_champions_bracket_type_check
  check (bracket_type in ('academy', 'challenge', 'main', 'overall'));

do $$
declare
  v_function text;
  v_updated text;
  v_original_bracket_table text := $function_text$
    select
      bracket.id as tournament_bracket_id,
      bracket.name as bracket_name,
      case
        when bracket.name = 'Main' then 'main'
        when bracket.name = 'Challenge' then 'challenge'
        else null
      end as bracket_type,
      generated.id as generated_bracket_id,
      generated.format,
      case when bracket.name = 'Main' then 10 else 10 end
        as participation_points,
      case when bracket.name = 'Main' then 5 else 2 end
        as round_passed_points,
      case when bracket.name = 'Main' then 5 else 3 end
        as tournament_win_points
    from public.tournament_brackets as bracket
    join public.generated_brackets as generated
      on generated.tournament_bracket_id = bracket.id
    where bracket.tournament_id = p_tournament_id
      and bracket.name in ('Main', 'Challenge');
$function_text$;
  v_academy_bracket_table text := $function_text$
    with eligible_brackets as (
      select
        bracket.id as tournament_bracket_id,
        bracket.name as bracket_name,
        case
          when bracket.name = 'Academy' then 'academy'
          when bracket.name = 'Challenge' then 'challenge'
          when bracket.name = 'Main' then 'main'
          else null
        end as bracket_type,
        generated.id as generated_bracket_id,
        generated.format,
        case
          when bracket.name = 'Main' then 'main'
          else 'lower'
        end as reward_tier
      from public.tournament_brackets as bracket
      join public.generated_brackets as generated
        on generated.tournament_bracket_id = bracket.id
      where bracket.tournament_id = p_tournament_id
        and bracket.name in ('Academy', 'Challenge', 'Main')
    )
    select
      tournament_bracket_id,
      bracket_name,
      bracket_type,
      generated_bracket_id,
      format,
      10 as participation_points,
      case when reward_tier = 'main' then 5 else 2 end
        as round_passed_points,
      case when reward_tier = 'main' then 5 else 3 end
        as tournament_win_points
    from eligible_brackets;
$function_text$;
begin
  select pg_get_functiondef(
    'public.recalculate_leaderboard_for_tournament(uuid,text)'::regprocedure
  )
  into v_function;

  if v_function is null then
    raise exception 'recalculate_leaderboard_for_tournament(uuid,text) was not found';
  end if;

  if strpos(v_function, v_original_bracket_table) = 0 then
    raise exception 'Expected leaderboard bracket reward mapping block was not found';
  end if;

  v_updated := replace(
    v_function,
    v_original_bracket_table,
    v_academy_bracket_table
  );

  if (
    length(v_updated) -
    length(replace(
      v_updated,
      $function_text$where bracket.bracket_type in ('main', 'challenge');$function_text$,
      ''
    ))
  ) / length($function_text$where bracket.bracket_type in ('main', 'challenge');$function_text$) <> 2 then
    raise exception 'Expected tournament participation/round-passed bracket filters were not found';
  end if;

  v_updated := replace(
    v_updated,
    $function_text$where bracket.bracket_type in ('main', 'challenge');$function_text$,
    $function_text$where bracket.bracket_type in ('academy', 'main', 'challenge');$function_text$
  );

  if strpos(
    v_updated,
    $function_text$where bracket.bracket_type in ('main', 'challenge')
      and bracket.format = 'single_elimination';$function_text$
  ) = 0 then
    raise exception 'Expected tournament single-elimination winner bracket filter was not found';
  end if;

  v_updated := replace(
    v_updated,
    $function_text$where bracket.bracket_type in ('main', 'challenge')
      and bracket.format = 'single_elimination';$function_text$,
    $function_text$where bracket.bracket_type in ('academy', 'main', 'challenge')
      and bracket.format = 'single_elimination';$function_text$
  );

  if strpos(
    v_updated,
    $function_text$where bracket.bracket_type in ('main', 'challenge')
      and bracket.format = 'round_robin';$function_text$
  ) = 0 then
    raise exception 'Expected tournament round-robin winner bracket filter was not found';
  end if;

  v_updated := replace(
    v_updated,
    $function_text$where bracket.bracket_type in ('main', 'challenge')
      and bracket.format = 'round_robin';$function_text$,
    $function_text$where bracket.bracket_type in ('academy', 'main', 'challenge')
      and bracket.format = 'round_robin';$function_text$
  );

  if v_updated = v_function then
    raise exception 'recalculate_leaderboard_for_tournament was not updated';
  end if;

  execute v_updated;
end;
$$;

do $$
declare
  v_function text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.recalculate_leaderboard_for_season(uuid,text)'::regprocedure
  )
  into v_function;

  if v_function is null then
    raise exception 'recalculate_leaderboard_for_season(uuid,text) was not found';
  end if;

  if strpos(v_function, $function_text$event.bracket_type in ('main', 'challenge')$function_text$) = 0 then
    raise exception 'Expected season overall bracket filter was not found';
  end if;

  if (
    length(v_function) -
    length(replace(
      v_function,
      $function_text$event.bracket_type in ('main', 'challenge')$function_text$,
      ''
    ))
  ) / length($function_text$event.bracket_type in ('main', 'challenge')$function_text$) <> 3 then
    raise exception 'Expected three season overall bracket filters were not found';
  end if;

  v_updated := replace(
    v_function,
    $function_text$event.bracket_type in ('main', 'challenge')$function_text$,
    $function_text$event.bracket_type in ('academy', 'main', 'challenge')$function_text$
  );

  if v_updated = v_function then
    raise exception 'recalculate_leaderboard_for_season was not updated';
  end if;

  execute v_updated;
end;
$$;
