// Every connection repeats the fixed authorized loopback/port/database guard.
import assert from 'node:assert/strict';
import {connect} from './local-client.mjs';
import {capture} from './fingerprint.mjs';
import {buildAtomicMigrationSql} from './package.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const actorSql="select 'local-consolidated-'||md5('consolidated-production-rehearsal:Main-player:0:1')::uuid as actor";
export async function checkMigrationLock(coordinator) {
 const before=await capture(coordinator),blocker=await connect();
 const started=Date.now();let denied=false;
 try {
  await blocker.query('begin;lock table public.players in access share mode');
  try{await coordinator.query(buildAtomicMigrationSql());}catch(e){if(e.code!=='55P03')throw e;denied=true;await coordinator.query('rollback');}
  assert(denied,'Active table reader must abort DDL at bounded lock timeout');
  assert(Date.now()-started<8000,'Migration lock wait exceeded bounded threshold');
  assert.equal((await blocker.query("select to_regclass('public.player_showcases') is null ok")).rows[0].ok,true,'Failed partial DDL must be invisible to another connection');
  assert.deepEqual(await capture(coordinator),before,'Lock failure changed schema/data/ledger');
  return 'Real separate-connection table reader forces bounded DDL timeout; whole package rollback and external invisibility exact';
 }finally{await blocker.query('rollback').catch(()=>{});await blocker.end();}
}
export async function checkConcurrency(coordinator) {
 const before=await capture(coordinator);
 assert.equal((await coordinator.query('select count(*)::integer n from public.player_showcases')).rows[0].n,0,'Requires empty new showcase history');
 const clients=await Promise.all([connect(),connect()]);
 try {
  const actor=(await coordinator.query(actorSql)).rows[0].actor;
  for(const c of clients){await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:actor})]);await c.query('set role authenticated');}
  const outcomes=await Promise.all(clients.map((c,i)=>c.query('select public.save_my_player_showcase_thought($1,0) result',['Concurrent local thought '+i])));
  assert.deepEqual(outcomes.map(r=>r.rows[0].result.code).sort(),['conflict','saved'],'First-save CAS must have exactly one winner');
  await coordinator.query('delete from public.player_showcases');
  // Both real closure bodies run with normal triggers in separate transactions.
  // Rollback retains every seeded historical row while checking their lock order.
  for(const c of clients){await c.query('reset role;begin');await c.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");}
  const secondActor=(await coordinator.query("select 'local-consolidated-'||md5('consolidated-production-rehearsal:Main-player:0:2')::uuid actor")).rows[0].actor;
  await clients[0].query('select public.close_ironclad_player_account($1)',[actor]);
  let secondDone=false;
  const waiting=clients[1].query('select public.close_ironclad_player_account($1)',[secondActor]).finally(()=>{secondDone=true;});
  let lockObserved=false;
  for(let i=0;i<30;i++){
   lockObserved=(await coordinator.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') ok",[clients[1].processID])).rows[0].ok;
   if(lockObserved)break;
   await sleep(20);
  }
  assert(lockObserved,'The second real closure must wait on the first closure lock');
  assert(!secondDone,'Concurrent closure must serialize before player locks');
  await clients[0].query('rollback');await waiting;await clients[1].query('rollback');
  assert.deepEqual(await capture(coordinator),before,'Concurrency rollback/cleanup changed any old or new persisted state');
  return ['Actual separate-connection first-save CAS: one saved, one conflict','Full Production account-closure chain serializes at original global lock; both rollback without history changes'];
 }finally{for(const c of clients){await c.query('rollback').catch(()=>{});await c.end();}}
}
