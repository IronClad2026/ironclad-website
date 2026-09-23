import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localClient, localPsqlArgument } from "./local-pg.mjs";
import { buildAtomicMigrationSql, repositoryRoot, sha256 } from "./package.mjs";
const db="p03_retention_race_"+Date.now();
const client=localClient(localPsqlArgument(),{database:db});
const id=n=>"d19a0000-0000-4000-8000-"+String(n).padStart(12,"0");
const checks=[];
const pass=name=>{checks.push(name);console.log("PASS "+name);};
const packageSql=buildAtomicMigrationSql();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function paused(sql,app="p03-retention-race"){
 const request=client.start("begin;\n"+sql+"\n\\echo P03_RETENTION_PAUSED",{interactive:true,app});
 const deadline=Date.now()+10000;
 while(!request.stdout.includes("P03_RETENTION_PAUSED")){
  assert(Date.now()<deadline,request.stderr||"session did not pause");await sleep(20);
 }
 return request;
}
async function finish(request,commit=false){request.child.stdin.end(commit?"commit;\n":"rollback;\n");const r=await request.done;assert.equal(r.code,0,r.stderr);}
async function locked(sql){const started=Date.now();const r=await client.start(sql).done;assert.notEqual(r.code,0);assert.match(r.stderr,/55P03/);assert(Date.now()-started<8000);}
try{
 await client.run(`create database ${db} template p03_empty;`,{db:"postgres"});
 await client.run(packageSql);
 const seed=readFileSync(path.join(repositoryRoot,"tests/database/match-room-phase-1.sql"),"utf8");
 await client.run(seed.slice(seed.indexOf("begin;"),seed.indexOf("-- Physical boundary:"))+"\ncommit;");
 await client.run("select public.set_match_room_enabled(true,'match-room-test-4');");
 const raw=await client.run(`set role authenticated;set request.jwt.claims='{"role":"authenticated","sub":"match-room-test-1"}';select public.resolve_match_room('${id(301)}');`);
 const room=JSON.parse(raw.split(/\r?\n/).at(-1)).room.id;
 await client.run(`set role authenticated;set request.jwt.claims='{"role":"authenticated","sub":"match-room-test-1"}';select public.send_match_room_message('${id(301)}','${room}','${id(8001)}','Synthetic concurrency retained body');`);
 await client.run(`begin;alter table public.tournaments disable trigger user;alter table public.tournaments enable trigger tournaments_match_room_closure_observation;
 update public.tournaments set status='completed' where id='${id(1)}';
 update ironclad_private.match_room_tournament_closures set completed_at=now()-interval '41 days' where tournament_id='${id(1)}';
 alter table public.tournaments enable trigger user;commit;`);
 const purge=`select public.purge_match_room_retention(array['${room}']::uuid[],'match-room-test-4');`;
 let a=await paused(`select 1 from public.tournaments where id='${id(1)}' for update;`);
 await locked(purge);await finish(a);
 assert.equal(await client.run(`select count(*) from public.match_messages where room_id='${room}';`),"1");
 pass("tournament-first lifecycle lock causes immediate NOWAIT failure without lock-inversion deadlock or deletion");
 // Two rooms in the same tournament: an existing finalizer owns match B
 // while waiting for tournament UPDATE after purge has admitted room A.
 const secondRoom=id(8100);
 await client.run(`begin;alter table public.tournament_matches disable trigger user;
 update public.tournament_matches set player_two_registration_id='${id(202)}',status='in_progress',activation_version=1,activated_at=now()-interval '1 hour',deadline_at=now()+interval '1 day' where id='${id(302)}';
 alter table public.tournament_matches enable trigger user;
 insert into public.match_rooms(id,match_id,room_revision,communication_generation,activation_version_snapshot,player_one_registration_id,player_two_registration_id,last_sequence)
 values('${secondRoom}','${id(302)}',1,1,1,'${id(201)}','${id(202)}',1);
 insert into public.match_messages(room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body)
 values('${secondRoom}',1,'player','${id(201)}','match-room-test-1','${id(8002)}','Synthetic second-room body');commit;`);
 const sorted=[room,secondRoom].sort();
 const lastMatch=sorted[1]===room?id(301):id(302);
 const beforeBatch=await client.run("select jsonb_agg(to_jsonb(m) order by id) from public.match_messages m;");
 a=await paused(`select ironclad_private.lock_match_room_privacy('${sorted[0]}');`);
 const finalizer=await paused(`select 1 from public.tournament_matches where id='${lastMatch}' for update;`,"p03-retention-finalizer");
 finalizer.child.stdin.write(`select 1 from public.tournaments where id='${id(1)}' for update;\n\\echo FINALIZER_RELEASED\n`);
 const deadline=Date.now()+1500;
 while(await client.run("select exists(select 1 from pg_stat_activity where application_name='p03-retention-finalizer' and wait_event_type='Lock');")!=="t"){
   assert(Date.now()<deadline,"finalizer did not wait on admitted tournament lock");await sleep(20);
 }
 a.child.stdin.end(`select public.purge_match_room_retention(array['${sorted[0]}','${sorted[1]}']::uuid[],'match-room-test-4');commit;\n`);
 const failedBatch=await a.done;assert.notEqual(failedBatch.code,0);assert.match(failedBatch.stderr,/55P03/);assert(!failedBatch.stderr.includes("40P01"));
 await finish(finalizer,true);
 assert.equal(await client.run("select jsonb_agg(to_jsonb(m) order by id) from public.match_messages m;"),beforeBatch);
 pass("two-room purge NOWAIT rejects later-match inversion and rolls back every earlier body deletion while finalizer commits");

 a=await paused(`select public.link_match_room_retention_case('${room}','${id(9001)}','support',null,'match-room-test-4');`);
 await locked(purge);await finish(a,true);
 assert.equal(JSON.parse(await client.run(purge)).messagesDeleted,0);
 pass("concurrent formal-case creation serializes before purge and protects committed case content");
 await client.run(`select public.link_match_room_retention_case('${room}','${id(9001)}','support',now()-interval '25 months','match-room-test-4');`);
 a=await paused(`select public.set_match_room_retention_hold('${room}',null,'${id(9002)}','legal',now()+interval '1 day','match-room-test-4');`);
 await locked(purge);await finish(a,true);
 assert.equal(JSON.parse(await client.run(purge)).messagesDeleted,0);
 await client.run(`select public.release_match_room_retention_hold((select id from ironclad_private.match_room_retention_holds where room_id='${room}'),'match-room-test-4');`);
 pass("concurrent narrow-scope hold installation serializes before purge and release resumes eligibility");
 a=await paused(`update public.match_result_report_groups set status='disputed',disputed_at=clock_timestamp() where id='${id(401)}';`);
 await locked(purge);await finish(a,true);
 assert.equal(JSON.parse(await client.run(purge)).messagesDeleted,0);
 pass("canonical result-case transition locks its match and committed dispute blocks purge");
 await client.run(`begin;alter table public.match_result_report_groups disable trigger user;alter table public.match_result_report_groups enable trigger match_result_groups_match_room_retention_lock;
 update public.match_result_report_groups set status='approved',finalized_at=now()-interval '25 months' where id='${id(401)}';
 alter table public.match_result_report_groups enable trigger user;alter table public.tournament_matches disable trigger user;
 update public.tournament_matches set status='completed',winner_registration_id='${id(201)}',player_one_score=2,player_two_score=0,official_result_decided_at=now()-interval '25 months' where id='${id(301)}';
 alter table public.tournament_matches enable trigger user;commit;`);
 const before=await client.run(`select jsonb_build_object('messages',(select jsonb_agg(to_jsonb(m) order by id) from public.match_messages m),
 'audit',(select jsonb_agg(to_jsonb(a) order by id) from ironclad_private.match_room_privacy_audit a));`);
 a=await paused(purge);
 await locked(`select public.set_match_room_retention_hold('${room}',null,'${id(9003)}','legal',now()+interval '1 day','match-room-test-4');`);
 await locked(`begin;select 1 from public.tournaments where id='${id(1)}' for update;rollback;`);
 await finish(a);
 assert.equal(await client.run(`select jsonb_build_object('messages',(select jsonb_agg(to_jsonb(m) order by id) from public.match_messages m),
 'audit',(select jsonb_agg(to_jsonb(a) order by id) from ironclad_private.match_room_privacy_audit a));`),before);
 pass("purge locks serialize later hold/reopen authority and rollback restores bodies and exact audit state");
 assert.equal(JSON.parse(await client.run(purge)).messagesDeleted,1);
 assert.equal(JSON.parse(await client.run(purge)).messagesDeleted,0);
 pass("successful retry after contention purges once and repeated batch is idempotent");
 writeFileSync(path.join(repositoryRoot,"tests/p03-db/retention-concurrency-evidence.json"),JSON.stringify({testedAt:new Date().toISOString(),postgres:await client.run("show server_version;"),packageSqlSha256:sha256(packageSql),status:"PASS",checks},null,2)+"\n");
}finally{for(const request of client.processes)request.child.kill();}
