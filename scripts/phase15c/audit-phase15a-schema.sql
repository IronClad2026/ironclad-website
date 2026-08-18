select json_build_object(
  'tables', (
    select json_agg(json_build_object(
      'name', class.relname,
      'rls', class.relrowsecurity,
      'force_rls', class.relforcerowsecurity
    ) order by class.relname)
    from pg_class as class
    join pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in ('legal_documents', 'registration_acceptances')
  ),
  'rls_policy_count', (
    select count(*)
    from pg_policy as policy
    where policy.polrelid in (
      'public.legal_documents'::regclass,
      'public.registration_acceptances'::regclass
    )
  ),
  'table_grants', (
    select json_agg(json_build_object(
      'table', class.relname,
      'grantee', case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end,
      'privilege', acl.privilege_type
    ) order by class.relname, grantee.rolname, acl.privilege_type)
    from pg_class as class
    join pg_namespace as namespace on namespace.oid = class.relnamespace
    cross join lateral aclexplode(
      coalesce(class.relacl, acldefault('r', class.relowner))
    ) as acl
    left join pg_roles as grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'public'
      and class.relname in ('legal_documents', 'registration_acceptances')
      and (
        acl.grantee = 0
        or grantee.rolname in (
        'anon',
        'authenticated',
        'service_role',
        'postgres'
        )
      )
  ),
  'triggers', (
    select json_agg(json_build_object(
      'table', class.relname,
      'trigger', trigger.tgname,
      'enabled', trigger.tgenabled,
      'function', procedure.proname
    ) order by class.relname, trigger.tgname)
    from pg_trigger as trigger
    join pg_class as class on class.oid = trigger.tgrelid
    join pg_namespace as namespace on namespace.oid = class.relnamespace
    join pg_proc as procedure on procedure.oid = trigger.tgfoid
    where namespace.nspname = 'public'
      and class.relname in (
        'legal_documents',
        'registration_acceptances',
        'registrations'
      )
      and not trigger.tgisinternal
      and trigger.tgname in (
        'legal_documents_protect_record',
        'registration_acceptances_guard_insert',
        'registration_acceptances_protect_record',
        'registrations_require_acceptance'
      )
  ),
  'functions', (
    select json_agg(json_build_object(
      'name', procedure.proname,
      'identity_args', pg_get_function_identity_arguments(procedure.oid),
      'security_definer', procedure.prosecdef,
      'config', procedure.proconfig
    ) order by procedure.proname, pg_get_function_identity_arguments(procedure.oid))
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'protect_legal_document_record',
        'guard_registration_acceptance_insert',
        'protect_registration_acceptance_record',
        'require_registration_acceptance_on_commit',
        'submit_verified_player_registration'
      )
  ),
  'function_grants', (
    select json_agg(json_build_object(
      'name', procedure.proname,
      'grantee', case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end,
      'privilege', acl.privilege_type
    ) order by procedure.proname, grantee.rolname)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) as acl
    left join pg_roles as grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'public'
      and procedure.proname in (
        'protect_legal_document_record',
        'guard_registration_acceptance_insert',
        'protect_registration_acceptance_record',
        'require_registration_acceptance_on_commit',
        'submit_verified_player_registration'
      )
      and (
        acl.grantee = 0
        or grantee.rolname in (
        'anon',
        'authenticated',
        'service_role',
        'postgres'
        )
      )
  ),
  'constraints', (
    select json_agg(json_build_object(
      'table', class.relname,
      'name', constraint_record.conname,
      'type', constraint_record.contype,
      'validated', constraint_record.convalidated
    ) order by class.relname, constraint_record.conname)
    from pg_constraint as constraint_record
    join pg_class as class on class.oid = constraint_record.conrelid
    join pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in ('legal_documents', 'registration_acceptances')
  ),
  'effective_index', (
    select json_agg(json_build_object(
      'name', index_record.relname,
      'unique', index_meta.indisunique,
      'valid', index_meta.indisvalid,
      'predicate', pg_get_expr(index_meta.indpred, index_meta.indrelid)
    ))
    from pg_index as index_meta
    join pg_class as index_record on index_record.oid = index_meta.indexrelid
    where index_record.relname = 'legal_documents_one_effective_kind_idx'
  )
) as phase15a_schema_audit;
