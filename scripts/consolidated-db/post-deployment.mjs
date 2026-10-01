// Offline reviewed SQL construction. No connector, client, credential or network.
import assert from 'node:assert/strict';
import {read,sha256,body,verifyPackage,retryState,baseline} from './package.mjs';
export const guardFile='20261001040810_production_retire_legacy_creation.sql';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
export function verifyPostDeploymentPackage() {
 const source=read('supabase/migrations/'+guardFile).replaceAll('\r','');
 const actual={file:guardFile,version:guardFile.slice(0,14),name:guardFile.slice(15,-4),sha256:sha256(source)};
 const manifest=JSON.parse(read('scripts/consolidated-db/post-deployment-manifest.json'));
 assert.equal(manifest.policy,'mandatory-postdeployment-four-model-creation-and-showcase-v1');
 assert.deepEqual(actual,manifest.migration,'Postdeployment guard source changed');
 return {...actual,source};
}
export function postDeploymentRetryState(rows) {
 assert.equal(retryState(rows),'already-applied','All five schema changes must be applied first');
 const guard=verifyPostDeploymentPackage();
 const entry=rows.find(row=>row.version===guard.version);
 assert.equal(rows.length,entry?159:158,'Unexpected postdeployment ledger count');
 for(const old of baseline.ledger)assert.equal(rows.find(row=>row.version===old.version)?.name,old.name,'Historical ledger changed');
 if(!entry)return 'unapplied';
 assert.equal(entry.name,guard.name);assert.deepEqual(entry.statements,[guard.source],'Postdeployment applied source changed');
 return 'already-applied';
}
export function buildPostDeploymentSql({candidateSha,projectRef,injectFailure=false}) {
 assert.equal(projectRef,'nsyjtqpvyxlzyujlbzos');assert.match(candidateSha,/^[a-f0-9]{40}$/);
 const guard=verifyPostDeploymentPackage();const schema=verifyPackage();
 const successors=JSON.parse(read('content/production-four-division-legal-release.json')).documents;
 const expectedSchema=schema.map(m=>({version:m.version,name:m.name,statements:[m.source]}));
 const old19=baseline.functions.find(f=>f.name==='save_tournament'&&!f.args.includes('division_model_version'));
 return `-- MANDATORY AFTER exact app+legal activation and before creation/registration unfreeze.
-- Requires independently verified app target/head attestation and explicit final release authorization.
begin;
set local lock_timeout='5s'; set local statement_timeout='120s';
select pg_advisory_xact_lock(hashtextextended('ironclad:consolidated-production:v1',0));
do $postdeploy_preflight$ begin
 if current_setting('ironclad.release_project_ref',true) is distinct from '${projectRef}'
 or current_setting('ironclad.release_candidate_sha',true) is distinct from '${candidateSha}'
 or current_setting('ironclad.release_app_verified_sha',true) is distinct from '${candidateSha}' then
 raise exception 'Missing independently verified exact app/Production/candidate attestation' using errcode='55000'; end if;
 if (select count(*) from supabase_migrations.schema_migrations)<>158
 or (select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations where version not in (${schema.map(m=>literal(m.version)).join(',')}))
 is distinct from ${literal(JSON.stringify(baseline.ledger.map(({version,name})=>({version,name}))))}::jsonb
 then raise exception 'Historical Production ledger changed before postdeployment guard' using errcode='55000'; end if;
 if (select md5(replace(pg_get_functiondef(p.oid),chr(13),'')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_tournament' and pg_get_function_identity_arguments(p.oid)=${literal(old19.args)}) is distinct from ${literal(old19.normalized_md5)} then raise exception 'Legacy editor authority drifted before retirement' using errcode='55000'; end if;
 if (select jsonb_agg(jsonb_build_object('version',version,'name',name,'statements',statements) order by version) from supabase_migrations.schema_migrations where version in (${schema.map(m=>literal(m.version)).join(',')}))
 is distinct from ${literal(JSON.stringify(expectedSchema))}::jsonb then raise exception 'Schema package ledger differs'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version=${literal(guard.version)}) then raise exception 'Postdeployment guard already recorded; verify exact retry receipt instead of reapplying' using errcode='55000'; end if;
 if (select count(*) from public.legal_documents)<>12 or (select count(*) from public.legal_documents where status='effective')<>4
 ${successors.map(d=>`or not exists(select 1 from public.legal_documents where document_kind=${literal(d.kind)} and version='3.2' and status='effective' and sha256=${literal(d.sha256)})`).join('\n ')}
 or not exists(select 1 from public.legal_documents where document_kind='privacy' and version='1.3' and status='effective' and sha256='6e0d930983e2f7fb82b0e6fa17da52b8255a0102d23bd7532874db2aa28de00a')
 or not exists(select 1 from public.legal_documents where document_kind='terms' and version='1.1' and status='effective' and sha256='59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1') then raise exception 'Exact Production legal activation must finish first'; end if;
 lock table public.platform_settings in share row exclusive mode;
 if (select value from public.platform_settings where key='player_showcase') is distinct from '{"enabled":false}'::jsonb
 or (select value from public.platform_settings where key='player_combat_highlights') is distinct from '{"enabled":false}'::jsonb then raise exception 'Preactivation optional flags differ'; end if;
end; $postdeploy_preflight$;
${body(guard.source)}
insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(guard.version)},${literal(guard.name)},array[${literal(guard.source)}]::text[]);
update public.platform_settings set value='{"enabled":true}'::jsonb where key='player_showcase';
do $postdeploy_flags$ begin
 if (select value from public.platform_settings where key='player_showcase') is distinct from '{"enabled":true}'::jsonb
 or (select value from public.platform_settings where key='player_combat_highlights') is distinct from '{"enabled":false}'::jsonb then raise exception 'Showcase activation/Highlights shutdown failed'; end if;
end; $postdeploy_flags$;
${injectFailure?"do $local_failure$ begin raise exception 'LOCAL_POSTDEPLOYMENT_INJECTED_FAILURE'; end; $local_failure$;":''}
commit;
`;
}
