-- Run after a fresh disposable replay, with the Storage ACLs mirrored from
-- Staging. Fixture rows and any attempted writes roll back together.
begin;

-- The disposable Storage prelude sets up the tables and RLS, but omits
-- Supabase's table-level API grants. Mirror those for this test transaction.
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;

do $$
declare
  relation text;
  role_name text;
  privilege_name text;
begin
  foreach relation in array array[
    'public.ready_wardrobe_pilot_profiles',
    'public.ready_wardrobe_pilot_coverage'
  ] loop
    if not (select relrowsecurity from pg_class where oid = relation::regclass)
       or exists (select 1 from pg_policy where polrelid = relation::regclass) then
      raise exception 'Unexpected RLS contract for %', relation;
    end if;
    foreach role_name in array array['anon', 'authenticated'] loop
    if has_function_privilege(role_name, 'public.ready_wardrobe_catalogue_ids_valid(text[])', 'execute') then
      raise exception 'Unexpected catalogue validation privilege for %', role_name;
    end if;
      foreach privilege_name in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
        if has_table_privilege(role_name, relation, privilege_name) then
          raise exception 'Unexpected % privilege on % for %', privilege_name, relation, role_name;
        end if;
      end loop;
    end loop;
  end loop;

  foreach privilege_name in array array['select', 'insert', 'update'] loop
    if not has_table_privilege('service_role', 'public.ready_wardrobe_pilot_profiles', privilege_name) then
      raise exception 'Missing trusted loadout privilege %', privilege_name;
    end if;
  end loop;
  foreach privilege_name in array array['delete', 'truncate', 'references', 'trigger'] loop
    if has_table_privilege('service_role', 'public.ready_wardrobe_pilot_profiles', privilege_name) then
      raise exception 'Unexpected trusted loadout privilege %', privilege_name;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.ready_wardrobe_pilot_coverage', 'select') then
    raise exception 'Missing trusted coverage reader';
  end if;
  foreach privilege_name in array array['insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    if has_table_privilege('service_role', 'public.ready_wardrobe_pilot_coverage', privilege_name) then
      raise exception 'Unexpected trusted coverage privilege %', privilege_name;
    end if;
  end loop;

  if not exists (
    select 1 from storage.buckets where id = 'ready-wardrobe-pilot' and name = id and public is false
  ) then
    raise exception 'Pilot Storage bucket is missing or public';
  end if;
end
$$;

insert into storage.objects (bucket_id, name)
values ('ready-wardrobe-pilot', 'user_pilot_database_fixture/clear.glb');

insert into public.ready_wardrobe_pilot_coverage (clerk_user_id, starts_at, ends_at)
values
  ('user_pilot_database_fixture', now() - interval '1 hour', now() + interval '1 hour'),
  ('user_pilot_database_expired', now() - interval '2 hours', now() - interval '1 hour');

set local role anon;
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'ready-wardrobe-pilot') then
    raise exception 'Anonymous Storage read exposed clear media';
  end if;
  begin
    insert into storage.objects (bucket_id, name) values ('ready-wardrobe-pilot', 'anon.glb');
    raise exception 'Anonymous Storage write succeeded';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"user_pilot_database_fixture"}', true);
do $$
declare
  changed integer;
begin
  if exists (select 1 from storage.objects where bucket_id = 'ready-wardrobe-pilot') then
    raise exception 'Authenticated Storage read bypassed the application';
  end if;
  begin
    insert into storage.objects (bucket_id, name) values ('ready-wardrobe-pilot', 'user_pilot_database_fixture/other.glb');
    raise exception 'Authenticated Storage write succeeded';
  exception when insufficient_privilege then null;
  end;
  update storage.objects set name = 'user_pilot_database_fixture/renamed.glb'
    where bucket_id = 'ready-wardrobe-pilot';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Authenticated Storage update affected bytes'; end if;
  delete from storage.objects where bucket_id = 'ready-wardrobe-pilot';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Authenticated Storage deletion affected bytes'; end if;
end
$$;

reset role;
set local role service_role;
do $$
declare
  invalid_items text[];
  invalid_id text;
begin
  if (select count(*) from storage.objects where bucket_id = 'ready-wardrobe-pilot') <> 1 then
    raise exception 'Trusted Storage reader cannot see the clear internal object';
  end if;
  if (select count(*) from public.ready_wardrobe_pilot_coverage where starts_at <= now() and ends_at > now()) <> 1 then
    raise exception 'Trusted coverage read did not separate active and expired rows';
  end if;
  begin
    update public.ready_wardrobe_pilot_coverage set ends_at = now() + interval '7 days';
    raise exception 'Application role can grant coverage';
  exception when insufficient_privilege then null;
  end;

  insert into public.ready_wardrobe_pilot_profiles (clerk_user_id) values ('user_pilot_database_fixture');
  insert into public.ready_wardrobe_pilot_profiles (clerk_user_id, item_ids)
  values ('user_pilot_database_fixture', array['eyewear_smoked_aviators', 'mouth_cigarette'])
  on conflict (clerk_user_id) do update set item_ids = excluded.item_ids;
  update public.ready_wardrobe_pilot_profiles
    set item_ids = array['eyewear_smoked_aviators', 'mouth_cigarette', 'face_clown_makeup']
    where clerk_user_id = 'user_pilot_database_fixture';
  if (select item_ids from public.ready_wardrobe_pilot_profiles where clerk_user_id = 'user_pilot_database_fixture')
     is distinct from array['eyewear_smoked_aviators', 'mouth_cigarette', 'face_clown_makeup'] then
    raise exception 'Verified three-item loadout failed to save';
  end if;

  update public.ready_wardrobe_pilot_profiles
    set catalogue_item_ids = array['eyewear_smoked_aviators', 'helmet_trim_dynamite_helmet_band', 'mouth_sparking_dynamite_stick'],
        dynamite_restore = array['mouth_cigarette']
    where clerk_user_id = 'user_pilot_database_fixture';
  if (select dynamite_restore from public.ready_wardrobe_pilot_profiles where clerk_user_id = 'user_pilot_database_fixture')
     is distinct from array['mouth_cigarette'] then
    raise exception 'Set restoration metadata failed to save';
  end if;
  begin
    update public.ready_wardrobe_pilot_profiles set catalogue_item_ids = array['tankers_crown'];
    raise exception 'A partial active preset was saved';
  exception when check_violation then null;
  end;
  begin
    update public.ready_wardrobe_pilot_profiles set catalogue_item_ids = array['tankers_crown','tankers_crown'], dynamite_restore = null;
    raise exception 'Duplicate expanded loadout was saved';
  exception when check_violation then null;
  end;
  begin
    update public.ready_wardrobe_pilot_profiles set catalogue_item_ids = array['unreleased'], dynamite_restore = null;
    raise exception 'Unknown expanded loadout item was saved';
  exception when check_violation then null;
  end;

  for invalid_items in
    select item_ids from (values
      (array['eyewear_smoked_aviators', 'eyewear_smoked_aviators']),
      (array['invalid']),
      (array[null]::text[]),
      (array[['mouth_cigarette']]),
      ('[0:0]={mouth_cigarette}'::text[])
    ) samples(item_ids)
  loop
    begin
      update public.ready_wardrobe_pilot_profiles set item_ids = invalid_items;
      raise exception 'Invalid loadout was saved';
    exception when check_violation then null;
    end;
  end loop;
  foreach invalid_id in array array['', '   ', chr(9) || chr(10)] loop
    begin
      insert into public.ready_wardrobe_pilot_profiles (clerk_user_id) values (invalid_id);
      raise exception 'Blank account ID was saved';
    exception when check_violation then null;
    end;
  end loop;
end
$$;

reset role;
do $$
declare
  invalid_window timestamptz[];
begin
  for invalid_window in
    select bound from (values
      (array[now(), now()]),
      (array[now(), now() - interval '1 day']),
      (array['-infinity'::timestamptz, now()]),
      (array[now(), 'infinity'::timestamptz])
    ) samples(bound)
  loop
    begin
      insert into public.ready_wardrobe_pilot_coverage (clerk_user_id, starts_at, ends_at)
      values ('user_pilot_database_invalid', invalid_window[1], invalid_window[2]);
      raise exception 'Invalid sandbox coverage was saved';
    exception when check_violation then null;
    end;
  end loop;
end
$$;

rollback;

select 'PASS Ready wardrobe pilot RLS, table grants, private Storage, loadout and sandbox coverage';
