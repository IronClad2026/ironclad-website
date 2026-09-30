begin;

create or replace function public.create_warfront_company_api(
  p_actor_clerk_user_id text,
  p_name text,
  p_tag text,
  p_slug text,
  p_description text,
  p_region text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.create_warfront_company($1,$2,$3,$4,$5,$6); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

commit;
