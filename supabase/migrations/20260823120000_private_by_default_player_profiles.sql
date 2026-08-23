begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $$
begin
  if pg_catalog.to_regclass('public.players') is null then
    raise exception using
      errcode = '42P01',
      message =
        'Private-profile correction precondition failed: public.players is missing';
  end if;
end;
$$;

lock table public.players in access exclusive mode;

do $$
declare
  v_type_oid oid;
  v_not_null boolean;
  v_default_expression text;
begin
  select
    attribute.atttypid,
    attribute.attnotnull,
    pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid)
  into
    v_type_oid,
    v_not_null,
    v_default_expression
  from pg_catalog.pg_attribute as attribute
  left join pg_catalog.pg_attrdef as default_value
    on default_value.adrelid = attribute.attrelid
   and default_value.adnum = attribute.attnum
  where attribute.attrelid = pg_catalog.to_regclass('public.players')
    and attribute.attname = 'public_profile_enabled'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if not found then
    raise exception using
      errcode = '42703',
      message =
        'Private-profile correction precondition failed: public_profile_enabled is missing';
  end if;

  if pg_catalog.format_type(v_type_oid, null) <> 'boolean' then
    raise exception using
      errcode = '42804',
      message =
        'Private-profile correction precondition failed: public_profile_enabled must be boolean';
  end if;

  if not v_not_null then
    raise exception using
      errcode = '23502',
      message =
        'Private-profile correction precondition failed: public_profile_enabled must be NOT NULL';
  end if;

  if v_default_expression is null
    or v_default_expression not in ('false', 'true') then
    raise exception using
      errcode = '55000',
      message =
        'Private-profile correction precondition failed: visibility default is unexpected';
  end if;
end;
$$;

-- Only the environment with the proven bad DEFAULT true can contain the
-- adjudicated default-created public rows. A canonical DEFAULT false database
-- may contain deliberate opt-ins, which this migration must preserve.
do $$
declare
  v_default_expression text;
  v_profile_count bigint;
  v_public_count bigint;
begin
  select pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid)
  into v_default_expression
  from pg_catalog.pg_attribute as attribute
  join pg_catalog.pg_attrdef as default_value
    on default_value.adrelid = attribute.attrelid
   and default_value.adnum = attribute.attnum
  where attribute.attrelid = pg_catalog.to_regclass('public.players')
    and attribute.attname = 'public_profile_enabled'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if v_default_expression = 'true' then
    select
      count(*),
      count(*) filter (where player.public_profile_enabled is true)
    into
      v_profile_count,
      v_public_count
    from public.players as player;

    if v_profile_count <> 2 or v_public_count <> 2 then
      raise exception using
        errcode = '55000',
        message =
          'Private-profile correction precondition failed: adjudicated Production profile aggregate changed';
    end if;

    update public.players
    set public_profile_enabled = false
    where public_profile_enabled is true;

    if exists (
      select 1
      from public.players as player
      where player.public_profile_enabled is true
    ) then
      raise exception using
        errcode = '55000',
        message =
          'Private-profile correction postcondition failed: an unproven public profile remains';
    end if;
  end if;
end;
$$;

alter table public.players
  alter column public_profile_enabled
  set default false;

do $$
declare
  v_default_expression text;
begin
  select pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid)
  into v_default_expression
  from pg_catalog.pg_attribute as attribute
  join pg_catalog.pg_attrdef as default_value
    on default_value.adrelid = attribute.attrelid
   and default_value.adnum = attribute.attnum
  where attribute.attrelid = pg_catalog.to_regclass('public.players')
    and attribute.attname = 'public_profile_enabled'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if v_default_expression is distinct from 'false' then
    raise exception using
      errcode = '55000',
      message =
        'Private-profile correction postcondition failed: default is not false';
  end if;

end;
$$;

commit;
