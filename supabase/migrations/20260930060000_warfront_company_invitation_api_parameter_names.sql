begin;

create or replace function public.invite_warfront_company_player_api(
  p_company_id uuid,
  p_actor_clerk_user_id text,
  p_recipient_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.invite_warfront_company_player($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.accept_warfront_company_invitation_api(
  p_invitation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.accept_warfront_company_invitation($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.decline_warfront_company_invitation_api(
  p_invitation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.decline_warfront_company_invitation($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.revoke_warfront_company_invitation_api(
  p_invitation_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.revoke_warfront_company_invitation($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.leave_warfront_company_api(
  p_company_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.leave_warfront_company($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.remove_warfront_company_member_api(
  p_company_id uuid,
  p_actor_clerk_user_id text,
  p_target_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.remove_warfront_company_member($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.promote_warfront_company_member_to_officer_api(
  p_company_id uuid,
  p_actor_clerk_user_id text,
  p_target_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.promote_warfront_company_member_to_officer($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.demote_warfront_company_officer_to_member_api(
  p_company_id uuid,
  p_actor_clerk_user_id text,
  p_target_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.demote_warfront_company_officer_to_member($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.transfer_warfront_company_commander_api(
  p_company_id uuid,
  p_actor_clerk_user_id text,
  p_target_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.transfer_warfront_company_commander($1,$2,$3); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

create or replace function public.archive_warfront_company_api(
  p_company_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$ begin if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'WARFRONT_TRUSTED_SERVER_REQUIRED' using errcode='42501';end if; return public.archive_warfront_company($1,$2); exception when serialization_failure or deadlock_detected then raise sqlstate 'PT409' using message=sqlerrm; end; $$;

commit;
