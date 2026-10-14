import assert from 'node:assert/strict';
import {read,baseline} from './package.mjs';
const expected=JSON.parse(read('scripts/consolidated-db/production-structure-definitions.json'));
// ACL entries form a permission set; array order changes when a provider grant
// is reconstructed. Preserve every grantee/privilege/grant option/grantor.
const canonical=value=>JSON.stringify(value,(key,item)=>['relacl','attacl','proacl'].includes(key)&&typeof item==='string'?'{' + item.slice(1,-1).split(',').sort().join(',') + '}':item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const sorted=rows=>rows.map(canonical).sort();
const sql={
 columns:"select n.nspname as schema,c.relname as table_name,a.attname as column_name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) as default_expression from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped",
 constraints:"select n.nspname as schema,c.relname as table_name,k.conname as constraint_name,k.contype,k.convalidated,pg_get_constraintdef(k.oid,true) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private')",
 relations:"select n.nspname as schema,c.relname as name,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p','v')",
 indexes:"select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','ironclad_private')",
 triggers:"select n.nspname as schema,c.relname as table_name,t.tgname as name,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and not t.tgisinternal",
 policies:"select schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check from pg_policies where schemaname in ('public','ironclad_private','storage')",
 views:"select n.nspname as schema,c.relname as name,pg_get_viewdef(c.oid,true) as definition,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind='v'",
 columnAcl:"select n.nspname as schema,c.relname as table_name,a.attname as name,a.attacl::text from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p','v') and a.attnum>0 and not a.attisdropped and a.attacl is not null",
 functionAcl:"select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as args,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','ironclad_private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')",
};
export async function compareStructure(client) {
 const report={};
 for(const [name,query]of Object.entries(sql)){
  const want=name==='columns'?baseline.columns:name==='constraints'?baseline.constraints:expected[name];
  const actual=(await client.query(query)).rows;
  const before=sorted(want),after=sorted(actual);
  report[name]={expected:want.length,actual:actual.length,exact:canonical(before)===canonical(after),missing:before.filter(r=>!after.includes(r)),extra:after.filter(r=>!before.includes(r))};
 }
 return report;
}
export async function assertStructure(client) {
 const report=await compareStructure(client);
 for(const [name,entry]of Object.entries(report))assert(entry.exact,`Current Production ${name} differ from replay: ${JSON.stringify(entry).slice(0,1600)}`);
 return Object.fromEntries(Object.entries(report).map(([k,v])=>[k,{count:v.actual,exact:v.exact}]));
}
