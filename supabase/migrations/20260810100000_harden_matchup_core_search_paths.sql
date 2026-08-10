begin;

-- The deadline migration preserves the deployed product logic by renaming
-- these SECURITY DEFINER functions. PostgreSQL also preserves their existing
-- function configuration during a rename, including legacy public-first
-- search paths. Every persistent object referenced by these bodies is already
-- schema-qualified; harden only the inherited function configuration.

alter function
  public.create_match_result_report_group_without_matchup_deadline(
    uuid,
    text,
    uuid,
    integer,
    integer,
    uuid[],
    text
  ) owner to postgres;
alter function
  public.create_match_result_report_group_without_matchup_deadline(
    uuid,
    text,
    uuid,
    integer,
    integer,
    uuid[],
    text
  ) set search_path = pg_catalog;
revoke all on function
  public.create_match_result_report_group_without_matchup_deadline(
    uuid,
    text,
    uuid,
    integer,
    integer,
    uuid[],
    text
  ) from public, anon, authenticated, service_role;

alter function public.submit_match_no_show_report_without_matchup_deadline(
  uuid,
  text,
  uuid,
  text
) owner to postgres;
alter function public.submit_match_no_show_report_without_matchup_deadline(
  uuid,
  text,
  uuid,
  text
) set search_path = pg_catalog;
revoke all on function
  public.submit_match_no_show_report_without_matchup_deadline(
    uuid,
    text,
    uuid,
    text
  ) from public, anon, authenticated, service_role;

alter function public.admin_finalize_match_result_report_group_core(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  uuid
) owner to postgres;
alter function public.admin_finalize_match_result_report_group_core(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  uuid
) set search_path = pg_catalog;
revoke all on function public.admin_finalize_match_result_report_group_core(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  uuid
) from public, anon, authenticated, service_role;

alter function public.review_match_series_result_without_deadline_restore(
  uuid,
  text,
  text,
  text
) owner to postgres;
alter function public.review_match_series_result_without_deadline_restore(
  uuid,
  text,
  text,
  text
) set search_path = pg_catalog;
revoke all on function
  public.review_match_series_result_without_deadline_restore(
    uuid,
    text,
    text,
    text
  ) from public, anon, authenticated, service_role;

alter function public.admin_reset_tournament_match_without_deadline_outcomes(
  uuid,
  text
) owner to postgres;
alter function public.admin_reset_tournament_match_without_deadline_outcomes(
  uuid,
  text
) set search_path = pg_catalog;
revoke all on function
  public.admin_reset_tournament_match_without_deadline_outcomes(uuid, text)
  from public, anon, authenticated, service_role;

alter function
  public.recalculate_leaderboard_for_season_without_outcome_filtering(
    uuid,
    text
  ) owner to postgres;
alter function
  public.recalculate_leaderboard_for_season_without_outcome_filtering(
    uuid,
    text
  ) set search_path = pg_catalog;
revoke all on function
  public.recalculate_leaderboard_for_season_without_outcome_filtering(
    uuid,
    text
  ) from public, anon, authenticated, service_role;

alter function
  public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(
    uuid,
    text
  ) owner to postgres;
alter function
  public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(
    uuid,
    text
  ) set search_path = pg_catalog;
revoke all on function
  public.recalculate_leaderboard_for_tournament_without_matchup_outcomes(
    uuid,
    text
  ) from public, anon, authenticated, service_role;

commit;
