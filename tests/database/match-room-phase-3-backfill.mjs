// LOCAL ONLY. Creates one fresh database from the empty Phase 1 template,
// verifies the actual forward migration against legacy requests, then removes it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const psql=process.argv[2];
assert(psql && process.argv.length===3,"Pass only the local psql executable");
const database="ironclad_match_room_phase3_backfill_tests";
const template="ironclad_match_room_tests";
let created=false;
function run(sql,db=database) {
  assert([database,template,"postgres"].includes(db));
  const result=spawnSync(psql,["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p","56591","-U","postgres","-d",db],{
    windowsHide:true,encoding:"utf8",input:sql,timeout:30000,
    env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP,TMP:process.env.TMP,PGCONNECT_TIMEOUT:"5"},
  });
  assert.equal(result.status,0,result.stderr);
  return result.stdout.trim();
}
try {
  assert.equal(run("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56591;","postgres"),"t");
  assert.equal(run("select not exists(select 1 from pg_database where datname='"+database+"');","postgres"),"t");
  assert.equal(run("select (select count(*) from public.players)=0 and to_regprocedure('public.get_match_room_assistance(uuid)') is null;",template),"t");
  run("create database "+database+" template "+template+";","postgres"); created=true;
  const phase1=readFileSync(new URL("./match-room-phase-1.sql",import.meta.url),"utf8");
  const setup=phase1.slice(phase1.indexOf("begin;"),phase1.indexOf("-- Physical boundary:"));
  const legacy=[
    "set local role authenticated;",
    "select pg_temp.mr_actor('match-room-test-1');",
    "insert into match_room_test_state values('ab',public.resolve_match_room(pg_temp.mr_id(301)));",
    "reset role;",
    "insert into public.notifications(recipient_role,type,title,message,tournament_id,match_id,registration_id,event_key,metadata,in_app_hidden_at)",
    "select 'admin','match.admin_assistance_requested','Legacy','Legacy',pg_temp.mr_id(1),pg_temp.mr_id(301),pg_temp.mr_id(200+n),'legacy-room-'||n,jsonb_build_object('roomId',pg_temp.mr_room('ab'),'roomRevision',1),case when n=2 then clock_timestamp() end from generate_series(1,2)n;",
    "insert into public.notifications(recipient_role,type,title,message,tournament_id,match_id,event_key) values('admin','match.admin_assistance_requested','Unscoped','Unscoped',pg_temp.mr_id(1),pg_temp.mr_id(301),'legacy-unscoped');",
    "commit;",
  ].join("\n");
  const migration=readFileSync(new URL("../../supabase/migrations/20260919235836_match_room_phase_three.sql",import.meta.url),"utf8");
  const verify=[
    "begin;",
    "select pg_temp.mr_assert((select count(*)=1 from public.match_room_assistance),'legacy fixed-room requests collapse to one state');",
    "select pg_temp.mr_assert((select status='requested' and request_version=1 from public.match_room_assistance),'dismissed legacy notice remains requested');",
    "set local role authenticated; select pg_temp.mr_actor('match-room-test-4',true);",
    "select public.resolve_match_room_assistance(pg_temp.mr_room('ab'),1);",
    "reset role;",
    "select pg_temp.mr_assert((select count(*)=2 and bool_and(read_at is not null and in_app_hidden_at is not null and push_delivery_status='skipped') from public.notifications where event_key like 'legacy-room-%'),'resolve retires every duplicate legacy room notification');",
    "select pg_temp.mr_assert((select read_at is null and in_app_hidden_at is null from public.notifications where event_key='legacy-unscoped'),'unscoped historical evidence is never assigned fabricated room identity');",
    "select 'BACKFILL_ASSERTIONS='||count(*) from match_room_test_results;",
    "rollback;",
  ].join("\n");
  const output=run(setup+legacy+"\n"+migration+"\n"+verify);
  assert.match(output,/BACKFILL_ASSERTIONS=5/);
  console.log("PASS actual forward migration with two room-scoped legacy requests, dismissed state, complete resolution, and untouched unscoped evidence");
} finally {
  if(created)run("drop database "+database+";","postgres");
  console.log("Removed only the newly created local backfill fixture database.");
}
