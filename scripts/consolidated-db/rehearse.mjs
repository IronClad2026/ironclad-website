// Never imports an app client, environment credential, Production row or connector.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {connect,run,scalar} from './local-client.mjs';
import {root,read,catalogQuery,expectedFunctions,buildAtomicMigrationSql,retryState,verifyPackage} from './package.mjs';
import {buildProductionLegalSql,validateLegalArtifacts} from '../consolidated-legal/publication.mjs';
import {preflightSql} from '../consolidated-release/sql.mjs';
import {historySql,capture} from './fingerprint.mjs';
import {buildPostDeploymentSql,postDeploymentRetryState,verifyPostDeploymentPackage} from './post-deployment.mjs';
import {checkConcurrency,checkMigrationLock} from './concurrency.mjs';
const client=await connect();
const steps=[];
const passed=step=>{steps.push(step);console.log('PASS '+step);};
const providerMode=process.env.CONSOLIDATED_PROVIDER_MODE??'native-compatibility';
try {
  await run(client,read('tests/consolidated-db/lifecycle-helpers.sql'));
  if(!process.argv.includes('--seeded')) {
    assert.equal(await scalar(client,'select count(*)::integer from public.players'),0,'Requires unseeded faithful Production replay');
    if(await scalar(client,'select count(*)::integer from public.legal_documents')===0)await run(client,read('tests/consolidated-db/legal-registry.sql'));
    await run(client,read('tests/consolidated-db/legacy-history.sql'));
    await run(client,read('tests/consolidated-db/retention-history.sql'));
  }
  assert.equal(await scalar(client,"select count(*)::integer from public.players where clerk_user_id not like 'local-consolidated-%'"),0,'Non-synthetic identity in disposable rehearsal');
  assert.equal(await scalar(client,'select count(*)::integer from public.players'),24);
  assert.equal(await scalar(client,'select count(*)::integer from public.legal_documents'),10);
  passed('Synthetic three-division completed legacy event: 21 normal scored matches, three settlements, one genuine Main qualifying slot, coherent legal and retention history');
  if(process.argv.includes('--seed-only')) {console.log(JSON.stringify({status:'PASS',scope:'seed-only',providerMode,capture:await capture(client)}));await client.end();process.exit(0);}
  const historyBefore=await scalar(client,historySql());
  const functionsBefore=await scalar(client,catalogQuery);
  assert.deepEqual(functionsBefore,expectedFunctions);
  const targetId=await scalar(client,"select md5('consolidated-production-rehearsal:event:1:0')::uuid");
  await run(client,preflightSql({candidateSha:'a'.repeat(40),targetRef:'nsyjtqpvyxlzyujlbzos',tournamentIds:[targetId],phase:'before-schema'}));
  passed(await checkMigrationLock(client));
  assert.equal(retryState((await client.query('select version,name,statements from supabase_migrations.schema_migrations')).rows),'unapplied');
  let injected=false;
  try {await run(client,buildAtomicMigrationSql({injectFailure:true}));} catch(e) {if(e.message!=='LOCAL_REHEARSAL_INJECTED_FAILURE')throw e;injected=true;await client.query('rollback');}
  assert(injected,'Failure injection did not reach final precommit boundary');
  assert.deepEqual(await scalar(client,catalogQuery),functionsBefore,'DDL rollback exact');
  assert.deepEqual(await scalar(client,historySql()),historyBefore,'History rollback exact');
  assert.equal(await scalar(client,"select to_regclass('public.player_showcases') is null"),true);
  assert.equal(await scalar(client,'select count(*)::integer from supabase_migrations.schema_migrations'),153);
  passed('Injected final-step failure rolled back all five DDL bodies, all ledger entries, functions and every old application column');
  await run(client,buildAtomicMigrationSql());
  assert.deepEqual(await scalar(client,historySql()),historyBefore,'Migration altered historical fields or timestamps');
  const retry=retryState((await client.query('select version,name,statements from supabase_migrations.schema_migrations')).rows);
  assert.equal(retry,'already-applied');
  assert.equal(await scalar(client,'select count(*)::integer from supabase_migrations.schema_migrations'),158);
  passed('Atomic apply and exact-checksum retry: 158 entries; every pre-existing application field and row is byte-identical');
  const afterFunctions=await scalar(client,catalogQuery);
  for(const [key,hash] of Object.entries(functionsBefore))if(/(retention|privacy_audit|redact|purge_closed)/.test(key))assert.equal(afterFunctions[key],hash,'Protected retention definition changed: '+key);
  await run(client,read('tests/consolidated-db/contracts.sql'));
  await run(client,read('tests/consolidated-db/editor-compatibility.sql'));
  passed('Version, grants, legal/privacy, retention-chain, optional-feature and partial-season contract assertions');
  for(const phase of ['before-schema','after-schema']){
    if(phase==='before-schema')continue;
    const sql=preflightSql({candidateSha:'a'.repeat(40),targetRef:'nsyjtqpvyxlzyujlbzos',tournamentIds:[await scalar(client,"select md5('consolidated-production-rehearsal:event:1:0')::uuid")],phase});
    const result=await run(client,sql);
    const snapshot=(Array.isArray(result)?result: [result]).find(r=>r.rows?.[0]?.jsonb_build_object)?.rows[0].jsonb_build_object;
    assert(snapshot,'Read-only release preflight did not return aggregate evidence');
    assert.equal(snapshot.checks.partialLegacyMainSeasons,1,'Partial historical Main must STOP');
    passed('Final preflight compiles and identifies preserved one-of-six legacy Main season as STOP');
  }
  validateLegalArtifacts(root);
  await client.query("select set_config('ironclad.release_project_ref','nsyjtqpvyxlzyujlbzos',false),set_config('ironclad.release_candidate_sha',$1,false)",['a'.repeat(40)]);
  const legalBefore=await scalar(client,'select md5(jsonb_agg(to_jsonb(d) order by id)::text) from public.legal_documents d');
  const options={projectRef:'nsyjtqpvyxlzyujlbzos',candidateSha:'a'.repeat(40)};
  await run(client,buildProductionLegalSql(options));
  assert.equal(await scalar(client,'select md5(jsonb_agg(to_jsonb(d) order by id)::text) from public.legal_documents d'),legalBefore,'Dry-run changed legal registry');
  const apply={...options,apply:true,authorization:'Release the approved candidate to Production.'};
  await run(client,buildProductionLegalSql(apply));
  const legalApplied=await scalar(client,'select md5(jsonb_agg(to_jsonb(d) order by id)::text) from public.legal_documents d');
  await run(client,buildProductionLegalSql(apply));
  assert.equal(await scalar(client,'select md5(jsonb_agg(to_jsonb(d) order by id)::text) from public.legal_documents d'),legalApplied,'Legal retry not exact');
  const afterLegal=await scalar(client,historySql());
  assert.equal(await scalar(client,'select count(*)::integer from public.legal_documents'),12);
  for(const [name,before] of Object.entries(historyBefore))if(name!=='public.legal_documents')assert.deepEqual(afterLegal[name],before,'Legal publication changed '+name);
  passed('Rulebook/PPA 3.2 dry-run rollback, apply and retry; Terms 1.1/Privacy 1.3 and all old acceptances/history exact');
  await client.query("select set_config('ironclad.release_app_verified_sha',$1,false)",['a'.repeat(40)]);
  const postOptions={projectRef:'nsyjtqpvyxlzyujlbzos',candidateSha:'a'.repeat(40)};
  const preGuard=await capture(client);
  let postFailure=false;
  try{await run(client,buildPostDeploymentSql({...postOptions,injectFailure:true}));}catch(e){if(e.message!=='LOCAL_POSTDEPLOYMENT_INJECTED_FAILURE')throw e;postFailure=true;await client.query('rollback');}
  assert(postFailure);assert.deepEqual(await capture(client),preGuard,'Postdeploy rollback changed schema/data/ledger');
  await run(client,buildPostDeploymentSql(postOptions));
  assert.equal(postDeploymentRetryState((await client.query('select version,name,statements from supabase_migrations.schema_migrations')).rows),'already-applied');
  assert.equal(await scalar(client,'select count(*)::integer from supabase_migrations.schema_migrations'),159);
  assert.deepEqual(await scalar(client,historySql()),afterLegal,'Postdeploy guard changed old history/core flags');
  await run(client,read('tests/consolidated-db/editor-compatibility.sql'));
  passed('Postdeployment guard/Showcase activation rollback, apply and exact retry: cached19 creation rejected, legacy edits retained, HighlightsOFF/core flags/history unchanged');
  await run(client,read('tests/consolidated-db/future-lifecycle.sql'));
  assert.deepEqual(await scalar(client,historySql()),afterLegal,'Rolled-back future rehearsal leaked state');
  passed('Future four-division six-event lifecycle and badge/accounting retry assertions, fully rolled back');
  await run(client,read('tests/consolidated-db/showcase-contract.sql'));
  await run(client,read('tests/consolidated-db/highlights-contract.sql'));
  assert.deepEqual(await scalar(client,historySql()),afterLegal,'Optional feature rollback leaked old state');
  passed('Showcase and 70+ Highlights actual-role, CAS, legal, quota, safe projection, moderation and durable cleanup contracts');
  const isolate=`do $$ declare targets text; begin if current_database()<>'consolidated_rehearsal' then raise exception 'Wrong DB'; end if; select string_agg(format('%I.%I',n.nspname,c.relname),',') into targets from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ironclad_private') and c.relkind in ('r','p') and c.relname not in ('platform_settings','legal_documents'); execute 'truncate '||targets||' cascade'; truncate realtime.messages; end $$;`;
  const roomFixture=read('tests/database/match-room-phase-1.sql').replaceAll('\r','').replaceAll("'match-room-test'","'relic-highest-1v1-v1'");
  const prefix=roomFixture.slice(0,roomFixture.indexOf('-- Physical boundary:')).replace('begin;',()=> 'begin;\n'+isolate);
  await run(client,prefix+read('tests/p03-db/retention.sql'));
  await run(client,prefix+read('tests/consolidated-db/realtime-contract.sql'));
  assert.deepEqual(await scalar(client,historySql()),afterLegal,'Retention/Realtime rollback leaked history');
  passed('Production retention/privacy contract plus private Realtime authorization, transactional rollback, fallback and stale-generation contracts');
  const lastPreflight=await run(client,preflightSql({candidateSha:'a'.repeat(40),targetRef:'nsyjtqpvyxlzyujlbzos',tournamentIds:[await scalar(client,"select md5('consolidated-production-rehearsal:event:1:0')::uuid")],phase:'after-activation'}));
  const snapshot=(Array.isArray(lastPreflight)?lastPreflight:[lastPreflight]).find(r=>r.rows?.[0]?.jsonb_build_object)?.rows[0].jsonb_build_object;
  assert(snapshot);assert.equal(snapshot.checks.partialLegacyMainSeasons,1);
  passed('Final postactivation aggregate preflight compiles with159 ledger entries and still STOPs on partial legacy Main');
  for(const proof of await checkConcurrency(client))passed(proof);
  const report={schemaVersion:1,status:'PASS',scope:'isolated synthetic consolidated migration rehearsal',providerMode,serverVersion:await scalar(client,'show server_version'),exactBaselineFunctions:320,baselineLedgerEntries:153,candidateLedgerEntries:159,steps,migrations:verifyPackage().map(({file,sha256})=>({file,sha256})),postdeployment:verifyPostDeploymentPackage().sha256,productionApplicationDataImported:false,productionRead:false,productionMutated:false,
    limitations:providerMode==='native-compatibility'?['Native PostgreSQL 17.6 provider stubs: no actual pg_cron/pg_net/Vault/hosted Realtime proof','No full logical backup/restore proof; mandatory exact Supabase image CI remains separate','No hosted WebSocket, Clerk, Storage byte or external media runtime proof']:['Actual extension binaries; synthetic Auth/Storage metadata, no hosted WebSocket service','A fresh real Production backup and restore receipt remain mandatory at release time']};
  const out=process.env.CONSOLIDATED_EVIDENCE_FILE??path.join(root,'test-results/consolidated-db-rehearsal.json');assert(path.isAbsolute(out),'Evidence path must be absolute');mkdirSync(path.dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',steps:steps.length,providerMode,evidence:out}));
} catch(e) {await client.query('rollback').catch(()=>{});console.error('LOCAL_REHEARSAL_FAIL '+e.message+' '+(e.code??''));throw e;} finally{await client.end();}
