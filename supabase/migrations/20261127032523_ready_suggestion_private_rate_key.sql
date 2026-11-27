begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Independent secret for Ready's suggestion quota. No application role can
-- read it and no new credential needs to be provisioned in Vercel.
create table ironclad_private.ready_suggestion_rate_key (
  singleton boolean primary key default true check (singleton),
  secret bytea not null check (octet_length(secret) = 32)
);
alter table ironclad_private.ready_suggestion_rate_key owner to postgres;
alter table ironclad_private.ready_suggestion_rate_key enable row level security;
revoke all on ironclad_private.ready_suggestion_rate_key from public, anon, authenticated, service_role;
insert into ironclad_private.ready_suggestion_rate_key (secret) values (extensions.gen_random_bytes(32));

create function public.submit_ready_topic_suggestion_with_private_quota(
  p_id uuid, p_description text, p_category text, p_menu text, p_catalogue text, p_rate_source text
) returns text language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_secret bytea;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted Ready server required' using errcode = '42501';
  end if;
  if p_rate_source is null or p_rate_source !~ '^[a-f0-9]{64}$' then return 'invalid'; end if;
  select secret into strict v_secret from ironclad_private.ready_suggestion_rate_key where singleton;
  return public.submit_ready_topic_suggestion(p_id, p_description, p_category, p_menu, p_catalogue,
    encode(extensions.hmac(decode(p_rate_source, 'hex'), v_secret, 'sha256'), 'hex'));
end;
$$;
alter function public.submit_ready_topic_suggestion_with_private_quota(uuid, text, text, text, text, text) owner to postgres;
revoke all on function public.submit_ready_topic_suggestion_with_private_quota(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_ready_topic_suggestion_with_private_quota(uuid, text, text, text, text, text) to service_role;

commit;
