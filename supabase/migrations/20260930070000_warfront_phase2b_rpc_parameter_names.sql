begin;

create or replace function public.cancel_warfront_open_operation_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.cancel_warfront_open_operation($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.submit_warfront_operation_result_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text,
  p_client_submission_id uuid,
  p_challenger_wins smallint,
  p_opponent_wins smallint
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.submit_warfront_operation_result($1,$2,$3,$4,$5);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create or replace function public.confirm_warfront_operation_result_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.confirm_warfront_operation_result($1,$2);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

create or replace function public.dispute_warfront_operation_result_api(
  p_operation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501'; end if;
  return public.dispute_warfront_operation_result($1,$2);
exception when serialization_failure then raise sqlstate 'PT409' using message=sqlerrm;
end;
$$;

commit;
