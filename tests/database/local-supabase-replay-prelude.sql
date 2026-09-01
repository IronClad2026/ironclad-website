-- Local-only compatibility surface for replaying repository migrations on
-- stock PostgreSQL. It does not emulate Supabase behavior; it supplies only
-- the schemas and signatures normally owned by a fresh Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists vault;
create schema if not exists net;
create schema if not exists cron;

create extension if not exists pgcrypto with schema public;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'role', '');
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

create or replace function extensions.gen_random_bytes(length integer)
returns bytea
language sql
volatile
strict
as $$
  select public.gen_random_bytes(length);
$$;

create table if not exists vault.decrypted_secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  decrypted_secret text
);

create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 1000
)
returns bigint
language sql
volatile
as $$
  select 1::bigint;
$$;

create table if not exists cron.job (
  jobid bigint generated always as identity primary key,
  jobname text not null unique,
  schedule text not null,
  command text not null
);

create or replace function cron.schedule(
  job_name text,
  schedule text,
  command text
)
returns bigint
language plpgsql
as $$
declare
  resolved_job_id bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname) do update
  set schedule = excluded.schedule,
      command = excluded.command
  returning jobid into resolved_job_id;

  return resolved_job_id;
end;
$$;

create or replace function cron.unschedule(job_id bigint)
returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobid = job_id;
  return found;
end;
$$;
