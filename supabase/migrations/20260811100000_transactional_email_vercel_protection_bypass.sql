begin;

create or replace function public.invoke_transactional_email_worker()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_worker_url text;
  v_worker_secret text;
  v_vercel_bypass_secret text;
begin
  select secret.decrypted_secret
  into v_worker_url
  from vault.decrypted_secrets as secret
  where secret.name = 'ironclad_transactional_email_worker_url'
  limit 1;

  select secret.decrypted_secret
  into v_worker_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'ironclad_transactional_email_worker_secret'
  limit 1;

  select secret.decrypted_secret
  into v_vercel_bypass_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'ironclad_transactional_email_vercel_bypass_secret'
  limit 1;

  v_worker_url := nullif(btrim(v_worker_url), '');
  v_worker_secret := nullif(btrim(v_worker_secret), '');
  v_vercel_bypass_secret := nullif(btrim(v_vercel_bypass_secret), '');

  if v_worker_url is null
    or v_worker_secret is null
    or v_vercel_bypass_secret is null then
    return null;
  end if;

  if v_worker_url !~
      '^https://[^/?#@[:space:]]+/api/internal/transactional-email$'
    or position('?' in v_worker_url) > 0
    or position('#' in v_worker_url) > 0
    or position('@' in v_worker_url) > 0 then
    return null;
  end if;

  return net.http_post(
    url := v_worker_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_worker_secret,
      'Content-Type', 'application/json',
      'x-vercel-protection-bypass', v_vercel_bypass_secret
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 70000
  );
end;
$$;

alter function public.invoke_transactional_email_worker()
  owner to postgres;
revoke all on function public.invoke_transactional_email_worker()
  from public, anon, authenticated, service_role;

commit;
