begin;

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by_clerk_user_id text,
  constraint platform_settings_key_check
    check (char_length(key) > 0 and char_length(key) <= 100),
  constraint platform_settings_value_object_check
    check (jsonb_typeof(value) = 'object')
);

drop trigger if exists platform_settings_set_updated_at
  on public.platform_settings;
create trigger platform_settings_set_updated_at
before update on public.platform_settings
for each row execute function public.ironclad_set_updated_at();

alter table public.platform_settings enable row level security;

revoke all on public.platform_settings from public, anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;
grant all on public.platform_settings to service_role;

drop policy if exists "Public can read platform settings"
  on public.platform_settings;
create policy "Public can read platform settings"
on public.platform_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update platform settings"
  on public.platform_settings;
create policy "Admins can update platform settings"
on public.platform_settings
for update
to authenticated
using (public.is_admin_jwt())
with check (public.is_admin_jwt());

insert into public.platform_settings (
  key,
  value
)
values (
  'elo_verification',
  '{"enabled": false}'::jsonb
)
on conflict (key) do nothing;

commit;
