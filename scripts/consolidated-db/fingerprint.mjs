import {baseline} from './package.mjs';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const relations=Object.groupBy(baseline.columns,c=>`${c.schema}.${c.table_name}`);
export function historySql() {
 return 'select jsonb_object_agg(name,value) as value from ('+Object.entries(relations).map(([name,cols])=>{
 const scope=name==='public.platform_settings'?" where t.key in ('match_room','elo_verification')":'';
 const projection=cols.map(c=>literal(c.column_name)+',to_jsonb(t."'+c.column_name+'")').join(',');
 return `select ${literal(name)} name,jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(fact order by fact::text),'[]'::jsonb)::text,'UTF8')),'hex')) value from (select jsonb_build_object(${projection}) fact from ${name} t${scope}) facts`;
 }).join('\nunion all\n')+') checks;';
}
const schemaObjectsCte=`with objects as (
 select 'functions' category,n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' name,jsonb_build_object('body',replace(pg_get_functiondef(p.oid),chr(13),''),'acl',case when p.proacl is null then null else array(select x::text from unnest(p.proacl) x order by x::text) end,'owner',pg_get_userbyid(p.proowner)) fact from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','ironclad_private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
 union all select 'relations',n.nspname||'.'||c.relname,jsonb_build_object('kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner),'acl',case when c.relacl is null then null else array(select x::text from unnest(c.relacl) x order by x::text) end,'options',c.reloptions) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p','v')
 union all select 'columns',n.nspname||'.'||c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'acl',case when a.attacl is null then null else array(select x::text from unnest(a.attacl) x order by x::text) end) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p','v') and a.attnum>0 and not a.attisdropped
 union all select 'constraints',n.nspname||'.'||c.relname||'.'||k.conname,jsonb_build_object('definition',pg_get_constraintdef(k.oid,true),'valid',k.convalidated) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private')
 union all select 'indexes',n.nspname||'.'||c.relname,jsonb_build_object('definition',pg_get_indexdef(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind='i'
 union all select 'triggers',n.nspname||'.'||c.relname||'.'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and not t.tgisinternal
 union all select 'policies',schemaname||'.'||tablename||'.'||policyname,jsonb_build_object('permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'check',with_check) from pg_policies where schemaname in ('public','ironclad_private','storage','realtime')
 union all select 'views',schemaname||'.'||viewname,jsonb_build_object('definition',definition) from pg_views where schemaname in ('public','ironclad_private')
)`;
export const schemaSql=schemaObjectsCte+` select jsonb_build_object('objects',count(*),'sha256',encode(sha256(convert_to(jsonb_agg(jsonb_build_object('category',category,'name',name,'fact',fact) order by category,name)::text,'UTF8')),'hex')) as value from objects;`;
// Diagnostic metadata stays inside the isolated synthetic runtime. Callers must
// use boundedSchemaDiff before emitting it; function bodies never enter logs.
export const schemaObjectsSql=schemaObjectsCte+` select jsonb_agg(jsonb_build_object('category',category,'name',name,'fact',fact) order by category,name) as value from objects;`;
export async function capture(client) {
 const rows=(await client.query("select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p') order by n.nspname,c.relname")).rows;
 const dataSql='select jsonb_object_agg(name,value) value from ('+rows.map(({nspname,relname})=>`select ${literal(nspname+'.'+relname)} name,jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) value from "${nspname}"."${relname}" t`).join(' union all ')+') all_data;';
 await client.query('begin transaction isolation level repeatable read read only');
 try {
  const schema=(await client.query(schemaSql)).rows[0].value;
  const data=(await client.query(dataSql)).rows[0].value;
  const ledger=(await client.query("select jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(jsonb_agg(to_jsonb(t) order by version)::text,'UTF8')),'hex')) value from supabase_migrations.schema_migrations t")).rows[0].value;
  const extensions=(await client.query("select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) order by extname) value from pg_extension e join pg_namespace n on n.oid=e.extnamespace")).rows[0].value;
  const retentionFunctions=(await client.query("select jsonb_object_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',md5(replace(pg_get_functiondef(p.oid),chr(13),''))) value from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','ironclad_private') and p.proname ~ '(retention|privacy_audit|redact|purge_closed)' ")).rows[0].value;
  return {schema,data,ledger,extensions,retentionFunctions};
 }finally{await client.query('rollback');}
}
