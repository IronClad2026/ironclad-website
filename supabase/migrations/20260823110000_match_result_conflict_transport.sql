begin;

-- PostgreSQL serialization failures are the internal concurrency signal used
-- by the Match-result core functions. PostgREST/Supabase may retry SQLSTATE
-- 40001 before returning an HTTP response, so externally called service-role
-- RPCs translate only that signal to the explicit, non-retryable HTTP 409
-- SQLSTATE at the API boundary. The nested exception block also guarantees
-- that the core call is fully rolled back before the conflict is translated.

create or replace function public.confirm_match_result_report_group_api(
  p_report_group_id uuid,
  p_confirmed_by_clerk_user_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.confirm_match_result_report_group(
    p_report_group_id,
    p_confirmed_by_clerk_user_id
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.confirm_match_result_report_group_api(uuid, text)
  owner to postgres;
revoke all on function public.confirm_match_result_report_group_api(uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_match_result_report_group_api(uuid, text)
  to service_role;

create or replace function public.dispute_match_result_report_group_api(
  p_report_group_id uuid,
  p_disputed_by_clerk_user_id text,
  p_dispute_notes text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.dispute_match_result_report_group(
    p_report_group_id,
    p_disputed_by_clerk_user_id,
    p_dispute_notes
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.dispute_match_result_report_group_api(uuid, text, text)
  owner to postgres;
revoke all on function public.dispute_match_result_report_group_api(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.dispute_match_result_report_group_api(
  uuid, text, text
) to service_role;

create or replace function public.admin_finalize_match_result_report_group_api(
  p_report_group_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_review_notes text default null,
  p_player_one_score integer default null,
  p_player_two_score integer default null,
  p_winner_registration_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.admin_finalize_match_result_report_group(
    p_report_group_id,
    p_decision,
    p_reviewed_by,
    p_review_notes,
    p_player_one_score,
    p_player_two_score,
    p_winner_registration_id
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.admin_finalize_match_result_report_group_api(
  uuid, text, text, text, integer, integer, uuid
) owner to postgres;
revoke all on function public.admin_finalize_match_result_report_group_api(
  uuid, text, text, text, integer, integer, uuid
) from public, anon, authenticated;
grant execute on function public.admin_finalize_match_result_report_group_api(
  uuid, text, text, text, integer, integer, uuid
) to service_role;

create or replace function public.apply_admin_official_match_result_api(
  p_match_id uuid,
  p_player_one_score integer,
  p_player_two_score integer,
  p_winner_registration_id uuid,
  p_decided_by text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.apply_admin_official_match_result(
    p_match_id,
    p_player_one_score,
    p_player_two_score,
    p_winner_registration_id,
    p_decided_by
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.apply_admin_official_match_result_api(
  uuid, integer, integer, uuid, text
) owner to postgres;
revoke all on function public.apply_admin_official_match_result_api(
  uuid, integer, integer, uuid, text
) from public, anon, authenticated;
grant execute on function public.apply_admin_official_match_result_api(
  uuid, integer, integer, uuid, text
) to service_role;

create or replace function public.review_match_series_result_api(
  p_submission_id uuid,
  p_decision text,
  p_reviewed_by text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.review_match_series_result(
    p_submission_id,
    p_decision,
    p_reviewed_by,
    p_review_notes
  );
exception
  when serialization_failure then
    raise sqlstate 'PT409' using message = sqlerrm;
end;
$$;

alter function public.review_match_series_result_api(uuid, text, text, text)
  owner to postgres;
revoke all on function public.review_match_series_result_api(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.review_match_series_result_api(
  uuid, text, text, text
) to service_role;

commit;
