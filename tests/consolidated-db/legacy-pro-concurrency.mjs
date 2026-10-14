// Separate-connection normal qualification proof on the attested synthetic runtime.
// Snapshot rows stay in memory; cleanup restores exact original rows and sequence state.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect} from '../../scripts/consolidated-db/local-client.mjs';
import {capture} from '../../scripts/consolidated-db/fingerprint.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const quote=value=>{assert.match(value,/^[A-Za-z_][A-Za-z0-9_]*$/);return '"'+value+'"';};
const relation=value=>quote(value.schema)+'.'+quote(value.name);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const claims="set local request.jwt.claims='{\"role\":\"service_role\",\"sub\":\"local-consolidated-admin\"}';";

async function attest(client) {
 assert.equal((await client.query("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and current_database()='consolidated_rehearsal' ok")).rows[0].ok,true);
 assert.equal((await client.query("select not exists(select 1 from public.players where clerk_user_id not like 'local-consolidated-%') ok")).rows[0].ok,true,'Non-synthetic identity forbids concurrency writes');
 // Native compatibility has no Auth identity table; real provider mode has an empty one.
 if((await client.query("select to_regclass('auth.users') is not null present")).rows[0].present)
  assert.equal((await client.query('select count(*)::integer n from auth.users')).rows[0].n,0,'Auth identities must remain empty synthetic metadata');
 if((await client.query("select to_regclass('vault.secrets') is not null present")).rows[0].present)
  assert.equal((await client.query('select count(*)::integer n from vault.secrets')).rows[0].n,0,'Never snapshot a credential-bearing Vault');
 const extensions=(await client.query("select extname from pg_extension where extname in ('pg_cron','pg_net')")).rows.map(row=>row.extname);
 if(extensions.includes('pg_cron'))assert.equal((await client.query("select current_setting('cron.launch_active_jobs') value")).rows[0].value,'off','Real cron worker must be disabled');
 if(extensions.includes('pg_net'))assert.equal((await client.query("select current_setting('pg_net.database_name') value")).rows[0].value,'postgres','Real network worker must target the other database');
}

async function fullSnapshot(client) {
 await attest(client);
 await client.query("begin transaction isolation level repeatable read read only;set local timezone='UTC';");
 try {
  const tables=new Map();let totalBytes=0;
  const names=(await client.query("select n.nspname schema,c.relname name,c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_' and c.relkind in ('r','p') and not c.relispartition order by n.nspname,c.relname")).rows;
  for(const table of names) {
   const columns=(await client.query("select attname,attgenerated,attidentity from pg_attribute where attrelid=$1 and attnum>0 and not attisdropped order by attnum",[table.oid])).rows;
   assert.equal((await client.query("select count(*)::integer n from pg_trigger where tgrelid=$1 and not tgisinternal and tgenabled='A'",[table.oid])).rows[0].n,0,'Always-enabled triggers prevent exact synthetic restoration');
   const row=(await client.query(`select count(*)::integer count,coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C"),'[]'::jsonb)::text rows from ${relation(table)} t`)).rows[0];
   totalBytes+=Buffer.byteLength(row.rows);assert(totalBytes<=32*1024*1024,'Synthetic in-memory snapshot exceeded its bounded size');
   tables.set(table.schema+'.'+table.name,{...table,columns,count:row.count,rows:row.rows,sha256:digest(row.rows)});
  }
  const sequences=new Map();
  for(const item of (await client.query("select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_' and c.relkind='S' order by n.nspname,c.relname")).rows)
   sequences.set(item.schema+'.'+item.name,{...item,...(await client.query('select last_value::text,is_called from '+relation(item))).rows[0]});
  const roles=(await client.query("select coalesce(jsonb_agg(to_jsonb(r) order by rolname),'[]'::jsonb)::text value from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig from pg_roles where rolname !~ '^pg_') r")).rows[0].value;
  const memberships=(await client.query("select coalesce(jsonb_agg(to_jsonb(m) order by role,member,grantor),'[]'::jsonb)::text value from (select r.rolname role,m.rolname member,g.rolname grantor,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where r.rolname !~ '^pg_') m")).rows[0].value;
  const extensions=(await client.query("select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) order by e.extname)::text value from pg_extension e join pg_namespace n on n.oid=e.extnamespace")).rows[0].value;
  return {tables,sequences,roles,memberships,extensions};
 }finally{await client.query('rollback');}
}

async function restoreSnapshot(client,before) {
 await attest(client);
 const after=await fullSnapshot(client);
 assert.deepEqual([...after.tables.keys()],[...before.tables.keys()],'Concurrency changed the relation inventory');
 assert.deepEqual([...after.sequences.keys()],[...before.sequences.keys()],'Concurrency changed the sequence inventory');
 const changed=[...before.tables.values()].filter(table=>after.tables.get(table.schema+'.'+table.name).sha256!==table.sha256);
 await client.query("begin;set local session_replication_role='replica';set local lock_timeout='5s';set local statement_timeout='120s';set local timezone='UTC';");
 try {
  for(const table of changed)await client.query('delete from '+relation(table));
  for(const table of changed) {
   if(table.count===0)continue;
   const columns=table.columns.filter(column=>column.attgenerated==='').map(column=>quote(column.attname));
   const override=table.columns.some(column=>column.attidentity!=='')?' overriding system value':'';
   await client.query(`insert into ${relation(table)} (${columns.join(',')})${override} select ${columns.map(column=>'r.'+column).join(',')} from jsonb_populate_recordset(null::${relation(table)},$1::jsonb) r`,[table.rows]);
  }
  await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}
 for(const [name,sequence] of before.sequences) {
  const current=after.sequences.get(name);
  if(sequence.last_value!==current.last_value||sequence.is_called!==current.is_called)
   await client.query('select setval($1::regclass,$2::bigint,$3)',[relation(sequence),sequence.last_value,sequence.is_called]);
 }
 assert.deepEqual(await fullSnapshot(client),before,'Synthetic contents, sequences, roles or provider metadata did not restore exactly');
}

async function begin(client,serviceRole=false) {
 await client.query("begin;set local lock_timeout='5s';set local statement_timeout='30s';"+claims);
 if(serviceRole)await client.query('set local role service_role');
}
async function finishEvent(client,event) {
 await client.query('select public.apply_admin_official_match_result_api($1,$2,0,$3,$4)',[event.match_id,event.winning_score,event.winner_registration_id,'local-consolidated-admin']);
 return (await client.query('select public.settle_leaderboard_division($1,null) result',[event.bracket_id])).rows[0].result;
}
function unchanged(outcome) {
 assert.equal(outcome.settlementCreated,false,'Settlement retry created duplicate authority');
 assert.equal(outcome.pointEventsChanged,false,'Settlement retry changed point evidence');
 assert.equal(outcome.lateEntryBonusesChanged,false,'Settlement retry changed late-entry evidence');
}
async function waitsAtRoot(observer,pid,owner) {
 for(let i=0;i<60;i++) {
  const waiting=(await observer.query("select exists(select 1 from pg_locks blocked join pg_locks held on held.locktype=blocked.locktype and held.classid=blocked.classid and held.objid=blocked.objid and held.objsubid=blocked.objsubid where blocked.pid=$1 and held.pid=$2 and blocked.locktype='advisory' and not blocked.granted and held.granted and blocked.objsubid=1 and blocked.classid::bigint=((hashtextextended('ironclad:leaderboard:all-time',0)>>32)&4294967295::bigint) and blocked.objid::bigint=(hashtextextended('ironclad:leaderboard:all-time',0)&4294967295::bigint)) ok",[pid,owner])).rows[0].ok;
  if(waiting)return true;
  await sleep(20);
 }
 return false;
}

export async function checkLegacyProConcurrency(coordinator) {
 await attest(coordinator);
 assert.equal((await coordinator.query("select to_regprocedure('pg_temp.fd_id(text,integer,integer)') is not null ok")).rows[0].ok,true,'Lifecycle helpers must be loaded on the coordinator');
 const source=(await coordinator.query("select x.season_id,x.tournament_id,x.tournament_bracket_id from ironclad_private.legacy_main_pro_season_transition x join public.leaderboard_seasons s on s.id=x.season_id where x.activated_at is not null and s.official_bracket_type='main' and s.finalized_at is null and (select count(*) from public.leaderboard_tournament_season_memberships m where m.season_id=s.id and m.qualifying_event_number is not null and m.voided_at is null)=1")).rows;
 assert.equal(source.length,1,'Race proof requires the approved activated one-of-six baseline');
 assert.equal((await coordinator.query("select count(*)::integer n from public.tournaments where id in(pg_temp.fd_id('event',100),pg_temp.fd_id('event',101))")).rows[0].n,0,'Owned race namespaces already exist');
 const applicationBefore=await capture(coordinator),before=await fullSnapshot(coordinator);
 const clients=[];const pending=[];let mutationStarted=false;let proofError;
 try {
  mutationStarted=true;
  await begin(coordinator);await coordinator.query("set local ironclad.test_model='four_division_v1';");
  for(const event of [100,101]) {
   await coordinator.query("select pg_temp.fd_create($1,'Pro',$1)",[event]);
   await coordinator.query("select pg_temp.fd_play($1,'Pro',6)",[event]);
  }
  await coordinator.query('commit');
  const events=(await coordinator.query("select t.id tournament_id,b.id bracket_id,m.id match_id,m.series_best_of/2+1 winning_score,m.player_one_registration_id winner_registration_id from public.tournaments t join public.tournament_brackets b on b.tournament_id=t.id join public.generated_brackets g on g.tournament_bracket_id=b.id join public.tournament_matches m on m.generated_bracket_id=g.id where t.id in(pg_temp.fd_id('event',100),pg_temp.fd_id('event',101)) and m.status='in_progress' order by t.slug")).rows;
  assert.equal(events.length,2,'Each future Pro event must have exactly one real final remaining');
  for(let i=0;i<3;i++){const client=await connect();clients.push(client);await attest(client);await begin(client,true);}
  // The normal first final writer itself takes and holds the existing root lock.
  await finishEvent(clients[0],events[0]);
  let secondDone=false,legacyDone=false;
  const second=finishEvent(clients[1],events[1]).then(result=>({result}),error=>({error})).finally(()=>{secondDone=true;});pending.push(second);
  const legacy=clients[2].query('select public.settle_leaderboard_division($1,null) result',[source[0].tournament_bracket_id]).then(result=>({result:result.rows[0].result}),error=>({error})).finally(()=>{legacyDone=true;});pending.push(legacy);
  assert(await waitsAtRoot(coordinator,clients[1].processID,clients[0].processID),'Second normal Pro completion did not serialize at the actual all-time root lock');
  assert(await waitsAtRoot(coordinator,clients[2].processID,clients[0].processID),'Concurrent original-event retry did not serialize at the same root lock');
  assert(!secondDone&&!legacyDone,'Concurrent writers bypassed the held root lock');
  await clients[0].query('commit');
  // Either waiter may win next; commit each as soon as its normal writer returns.
  // Waiting for B before committing a successful legacy retry would create a test deadlock.
  const commits=await Promise.allSettled([
   second.then(async result=>{try{if(result.error)throw result.error;await clients[1].query('commit');}catch(error){await clients[1].query('rollback');throw error;}}),
   legacy.then(async result=>{try{if(result.error)throw result.error;unchanged(result.result);await clients[2].query('commit');}catch(error){await clients[2].query('rollback');throw error;}}),
  ]);
  for(const result of commits)if(result.status==='rejected')throw result.reason;
  const memberships=(await coordinator.query('select tournament_id,season_id,qualifying_event_number,scored_at is not null scored,voided_at is null valid from public.leaderboard_tournament_season_memberships where tournament_id=any($1::uuid[]) order by qualifying_event_number',[events.map(event=>event.tournament_id)])).rows;
  assert.deepEqual(memberships.map(row=>row.qualifying_event_number),[2,3],'Racing genuine Pro completions need distinct sequential slots');
  assert(memberships.every(row=>row.season_id===source[0].season_id&&row.scored&&row.valid),'Race assigned a different season or fabricated an unscored/void membership');
  assert.equal((await coordinator.query('select count(*)::integer n from public.leaderboard_seasons where id=$1 and official_bracket_type=\'main\' and finalized_at is null',[source[0].season_id])).rows[0].n,1);
  for(const event of events) {
   const outcomes=await Promise.all(clients.slice(0,2).map(async client=>{await begin(client,true);try{const result=(await client.query('select public.settle_leaderboard_division($1,null) result',[event.bracket_id])).rows[0].result;await client.query('commit');return result;}catch(error){await client.query('rollback');throw error;}}));
   outcomes.forEach(unchanged);
  }
  assert.equal((await coordinator.query('select count(*)::integer n from public.leaderboard_tournament_season_memberships where season_id=$1 and qualifying_event_number is not null and voided_at is null',[source[0].season_id])).rows[0].n,3,'Retries consumed additional qualifying slots');
  assert.equal((await coordinator.query('select count(*)::integer n from public.leaderboard_point_events where tournament_id=any($1::uuid[])',[events.map(event=>event.tournament_id)])).rows[0].n,30,'Racing settlement or retries duplicated genuine Pro point events');
  let oldPoints;
  await coordinator.query("begin transaction isolation level repeatable read read only;set local timezone='UTC';");
  try {
   oldPoints=(await coordinator.query('select coalesce(jsonb_agg(to_jsonb(p) order by to_jsonb(p)::text collate "C"),\'[]\'::jsonb)::text rows from public.leaderboard_point_events p where tournament_id=$1',[source[0].tournament_id])).rows[0].rows;
  }finally{await coordinator.query('rollback');}
  assert.equal(oldPoints,before.tables.get('public.leaderboard_point_events').rows,'Concurrent future completion/retry changed original45 source points');
 }catch(error){proofError=error;}
 finally {
  // Release the holder before draining blocked queries, then roll every client back.
  if(clients[0])await clients[0].query('rollback').catch(()=>{});
  await Promise.allSettled(pending);
  for(const client of clients){await client.query('rollback').catch(()=>{});await client.end();}
  await coordinator.query('rollback').catch(()=>{});
  if(mutationStarted)await restoreSnapshot(coordinator,before);
  assert.deepEqual(await capture(coordinator),applicationBefore,'Concurrency cleanup changed schema/data/migration ledger/retention fingerprint');
 }
 if(proofError)throw proofError;
 return ['Separate connections serialize two genuine Pro final-result/settlement transactions at the original all-time lock into same-season slots2 and3; concurrent legacy retry and same-event retries preserve authority','Complete synthetic in-memory row/sequence/provider restoration and full schema/data/ledger capture are byte-exact; no persistent fixtures or exports'];
}
