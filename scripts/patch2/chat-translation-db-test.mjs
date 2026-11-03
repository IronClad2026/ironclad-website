import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// No env-file loading or caller-provided database target. Every connection is
// hardcoded loopback and is checked against the fresh cluster's data directory.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOLS = resolve(ROOT, "../release-execution-tools");
const BIN = resolve(TOOLS, "postgresql-17.11/pgsql/bin");
const { Client } = createRequire(import.meta.url)(resolve(TOOLS, "pg-client/node_modules/pg"));
const HOST = "127.0.0.1", PORT = 56735;
const RUN = resolve(ROOT, ".release-local", `patch2-chat-translation-${randomUUID()}`);
assert.ok(RUN.startsWith(`${resolve(ROOT, ".release-local")}${sep}`));
const DATA = resolve(RUN, "data"), passwordFile = resolve(RUN, "init-password");
const password = randomBytes(32).toString("base64url");
const childEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PG|DATABASE_|POSTGRES|SUPABASE|NEXT_PUBLIC_SUPABASE|CLERK|NEXT_PUBLIC_CLERK|CLOUDFLARE|CF_)/i.test(key)));
const migrationPath = "supabase/migrations/20261103024129_patch2_match_chat_translation.sql";
const migration = await readFile(resolve(ROOT, migrationPath), "utf8");
const digest = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const sources = [];
async function authority(path, name) {
  const source = (await readFile(resolve(ROOT, path), "utf8")).replace(/\r\n/g, "\n");
  const start = source.search(new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "i"));
  assert.ok(start >= 0, `Missing actual authority ${name}`);
  const end = source.indexOf("$$;", start); assert.ok(end > start);
  const sql = source.slice(start, end + 3); sources.push({ path, name, sha256: digest(sql) }); return sql;
}
const phase1 = "supabase/migrations/20260919011425_match_room_phase_one.sql";
const hardening = "supabase/migrations/20260920014644_match_room_production_hardening.sql";
const authorities = await Promise.all([
  authority("supabase/migrations/20260919235836_match_room_phase_three.sql", "ironclad_private.match_room_actor"),
  authority(hardening, "ironclad_private.match_room_context"),
  authority(phase1, "ironclad_private.match_room_access"),
  authority(hardening, "public.get_match_room_enabled"),
  authority(hardening, "ironclad_private.match_room_writes_enabled"),
  authority(hardening, "ironclad_private.require_match_room_enabled"),
  authority(hardening, "ironclad_private.match_room_projection"),
  authority(phase1, "ironclad_private.match_message_projection"),
  authority(phase1, "public.get_match_room_history"),
  authority("supabase/migrations/20260908052210_member_rpc_current_account_acceptance.sql", "ironclad_private.require_current_account_legal_acceptance"),
  authority(hardening, "ironclad_private.send_match_room_message"),
  authority(phase1, "public.send_match_room_message"),
]);
const report = { target: `fresh PostgreSQL17 ${HOST}:${PORT}`, migration: migrationPath,
  migrationSha256: digest(migration), actualAuthoritySources: sources, checks: [], limitations: [
    "Actual new migration and current actor/access/context/history/send/legal functions execute against a minimal local domain schema, not a complete Supabase installation.",
    "Local auth.role/auth.jwt claim shims do not verify Clerk signatures, PostgREST, browser sessions or provider responses.",
    "Message body edit/redaction, source deletion and purged-room final states are exercised directly; the complete pre-existing privacy/retention/account-closure/Storage chains are not executed.",
    "The existing notification triggers and full registration, result, deadline, replay and bracket authorities are not installed. Original protected rows are compared, and ordinary chat history/send/retry execute unchanged actual function definitions.",
    "Usage boundary setup deliberately seeds local counters at their limits and UTC day boundaries; no provider request is made and these limits do not claim to measure Cloudflare neurons.",
  ] };
let postgres, database, failure, log = ""; const clients = new Set();
function command(name, args) {
  const r = spawnSync(resolve(BIN, `${name}.exe`), args, { env: childEnvironment, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  if (r.error || r.status !== 0) throw new Error(`${name} failed: ${r.error?.message ?? r.stderr ?? r.stdout}`);
}
async function connect() {
  const c = new Client({ host: HOST, port: PORT, database: "postgres", user: "postgres", password,
    ssl: false, connectionTimeoutMillis: 1000, statement_timeout: 10_000,
    options: "-c timezone=UTC", application_name: "patch2_translation_disposable_local" });
  try { await c.connect(); } catch (e) { await c.end().catch(() => {}); throw e; }
  clients.add(c); return c;
}
async function claim(sub = "translation_p1", role = "player", c = database, dbRole = "authenticated") {
  assert.ok(["authenticated", "anon", "service_role"].includes(dbRole));
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claims',$2,false)",
    [dbRole, JSON.stringify({ sub, role: dbRole, metadata: { role } })]);
  await c.query(`set role ${dbRole}`);
}
async function owner() { await database.query("reset role"); }
async function query(sql, args = [], c = database) { return (await c.query(sql, args)).rows[0]?.value; }
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const P1 = uuid(1), R1 = uuid(601), R2 = uuid(602), M1 = uuid(701), M2 = uuid(703);
const read = (room = R1, ids = [M1], c = database) => query("select public.read_match_chat_translation_sources($1,$2) value", [room, ids], c);
const reserve = (message = M1, target = "it", source = "en", hash = hash1, room = R1, c = database) =>
  query("select public.reserve_match_chat_translation($1,$2,$3,$4,$5) value", [room,message,target,source,hash], c);
const complete = (lease, text, c = database) => query("select public.complete_match_chat_translation($1,$2) value", [lease,text], c);
async function error(op, code) { await assert.rejects(op, e => { assert.equal(e.code, code); return true; }); }
async function test(name, op) { await op(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function enabled(value) { await owner(); await database.query("update public.platform_settings set value=jsonb_build_object('enabled',$1::boolean) where key='match_chat_translation_enabled'",[value]); }
async function resetUsage() {
  await owner(); await database.query("delete from ironclad_private.match_chat_translations; delete from ironclad_private.match_chat_translation_usage; delete from ironclad_private.match_chat_translation_daily");
}
async function usage() {
  await owner(); return query("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(u) order by usage_day,player_id) from ironclad_private.match_chat_translation_usage u),'daily',(select jsonb_agg(to_jsonb(d) order by usage_day) from ironclad_private.match_chat_translation_daily d)) value");
}
async function domain() {
  await owner(); return digest(await query("select jsonb_build_object('registrations',(select jsonb_agg(to_jsonb(r) order by id) from public.registrations r),'matches',(select jsonb_agg(to_jsonb(m) order by id) from public.tournament_matches m),'tournaments',(select jsonb_agg(to_jsonb(t) order by id) from public.tournaments t),'rooms',(select jsonb_agg(to_jsonb(r) order by id) from public.match_rooms r),'chat',(select jsonb_agg(to_jsonb(m) order by id) from public.match_messages m)) value"));
}
let hash1, hash2, baseline, savedLease;
try {
  await new Promise((accept,reject) => { const s=net.createServer(); s.once("error",reject); s.listen({host:HOST,port:PORT,exclusive:true},()=>s.close(accept)); });
  await mkdir(resolve(ROOT,".release-local"),{recursive:true}); await mkdir(RUN);
  await writeFile(passwordFile,`${password}\n`,{flag:"wx",mode:0o600});
  command("initdb",["-D",DATA,"-U","postgres","--pwfile",passwordFile,"--auth=scram-sha-256","--encoding=UTF8","--locale=C","--no-instructions"]);
  await unlink(passwordFile);
  postgres=spawn(resolve(BIN,"postgres.exe"),["-D",DATA,"-h",HOST,"-p",String(PORT),"-c","unix_socket_directories=","-c","max_connections=18","-c","shared_buffers=16MB"],{env:childEnvironment,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  postgres.stdout.on("data",c=>{log+=c;}); postgres.stderr.on("data",c=>{log+=c;});
  for(let i=0;i<100;i++){try{database=await connect();break;}catch{await delay(100);}}
  assert.ok(database);
  const identity=(await database.query("select host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') directory,current_user")).rows[0];
  assert.equal(identity.host,HOST); assert.equal(identity.port,PORT); assert.equal(resolve(identity.directory),DATA); assert.equal(identity.current_user,"postgres"); report.databaseIdentity=identity;
  await database.query(await readFile(resolve(ROOT,"tests/patch2-db/chat-translation-schema.sql"),"utf8"));
  for(const sql of authorities) await database.query(sql);
  await database.query("revoke all on all functions in schema ironclad_private from public,anon,authenticated,service_role; revoke all on function public.get_match_room_history(uuid,bigint,integer),public.send_match_room_message(uuid,uuid,uuid,text) from public,anon,service_role; grant execute on function public.get_match_room_history(uuid,bigint,integer),public.send_match_room_message(uuid,uuid,uuid,text) to authenticated");
  const oldAuthorityHash=await query("select md5(string_agg(p.prosrc,',' order by p.oid)) value from pg_proc p where p.oid in('public.get_match_room_history(uuid,bigint,integer)'::regprocedure,'public.send_match_room_message(uuid,uuid,uuid,text)'::regprocedure,'ironclad_private.match_room_actor()'::regprocedure,'ironclad_private.match_room_access(uuid,text)'::regprocedure,'ironclad_private.match_room_context(uuid)'::regprocedure)");
  await database.query(migration); report.migrationApplied=true;
  await test("additive default-off migration leaves existing chat/access definitions unchanged",async()=>{
    assert.equal(await query("select (value->>'enabled')::boolean value from public.platform_settings where key='match_chat_translation_enabled'"),false);
    assert.equal(await query("select md5(string_agg(p.prosrc,',' order by p.oid)) value from pg_proc p where p.oid in('public.get_match_room_history(uuid,bigint,integer)'::regprocedure,'public.send_match_room_message(uuid,uuid,uuid,text)'::regprocedure,'ironclad_private.match_room_actor()'::regprocedure,'ironclad_private.match_room_access(uuid,text)'::regprocedure,'ironclad_private.match_room_context(uuid)'::regprocedure)"),oldAuthorityHash);
    await claim(); const s=await read(); assert.equal(s.enabled,false); hash1=s.messages[0].sourceHash;
    hash2=(await read(R2,[M2])).messages[0].sourceHash; assert.equal(hash1.length,64); assert.equal(hash2.length,64);
    assert.equal((await reserve()).status,"disabled"); assert.equal((await read(R1,[])).messages.length,0);
  });
  await test("ordinary old-client history/send/retry work with translation off",async()=>{
    await claim(); const before=await query("select public.get_match_room_history($1,0,50) value",[R1]); assert.equal(before.messages.length,2);
    const nonce=randomUUID(),args=[uuid(501),R1,nonce,"Original chat remains independent: 19:30 UTC, not 20:30."];
    const sent=await query("select public.send_match_room_message($1,$2,$3,$4) value",args);
    const retry=await query("select public.send_match_room_message($1,$2,$3,$4) value",args);
    assert.equal(sent.duplicate,false); assert.equal(retry.duplicate,true); assert.equal(retry.message.id,sent.message.id);
    const after=await query("select public.get_match_room_history($1,0,50) value",[R1]); assert.equal(after.messages.length,3); assert.equal(after.messages[2].body,args[3]);
    assert.equal((await usage()).daily,null); baseline=await domain();
  });
  await test("scope validation rejects mixed-room batches, malformed arrays and foreign room IDs",async()=>{
    await claim(); await error(read(R1,[M1,M2]),"42501"); await error(read(R1,[M1,M1]),"22023"); await error(read(R1,[null]),"22023");
    await error(read(R1,Array.from({length:51},(_,i)=>uuid(2000+i))),"22023"); await error(read(null,[M1]),"22023");
    const s=await read(R1,[uuid(9999)]); assert.equal(s.messages[0].original,null);
    assert.equal((await read(R1,[uuid(702)])).messages[0].original,null);
    await claim("translation_p3"); await error(read(R1,[M1]),"42501"); await error(reserve(),"42501");
    assert.equal((await read(R2,[M2])).messages[0].sourceHash,hash2);
  });
  await enabled(true);
  await test("same player in two tournaments gets authorized independent source text",async()=>{
    await claim(); assert.equal((await read()).messages[0].sourceHash,hash1); assert.equal((await read(R2,[M2])).messages[0].sourceHash,hash2);
    assert.equal((await reserve(M2,"fr","it",hash2,R2)).status,"reserved");
    assert.equal((await reserve(M2,"fr","it",hash2,R1)).status,"redacted");
    await error(reserve(M1,"de","en"),"22023");
  });
  await resetUsage();
  await test("server-only completion creates shared cache; cached reads consume no attempts",async()=>{
    await claim(); const r=await reserve(); assert.equal(r.status,"reserved"); savedLease=r.leaseId;
    await error(complete(savedLease,"Traduzione"),"42501");
    await claim("translation_p1","player",database,"service_role"); assert.equal(await complete(savedLease,"No, @Ace: 7 novembre 2026 alle 19:30 UTC; 2–1."),true);
    const before=await usage(); await claim("translation_p2"); const cached=await reserve(); assert.equal(cached.status,"cached"); assert.match(cached.translatedText,/19:30 UTC/); assert.deepEqual(await usage(),before);
  });
  await test("cache never bypasses current active identity and room permission even when disabled",async()=>{
    for(const sub of ["translation_outsider","translation_closed","missing_player"]){await claim(sub); await error(read(),"42501"); await error(reserve(),"42501");}
    await owner(); await database.query("update public.players set account_closed_at=now() where id=$1",[P1]);
    await claim(); await error(reserve(),"42501"); await owner(); await database.query("update public.players set account_closed_at=null where id=$1",[P1]);
    await database.query("update public.registrations set clerk_user_id='temporary_local_reassignment' where id=$1",[uuid(402)]);
    await claim("translation_p2"); await error(reserve(),"42501"); await owner(); await database.query("update public.registrations set clerk_user_id='translation_p2' where id=$1",[uuid(402)]);
    await enabled(false); await claim("translation_outsider"); await error(reserve(),"42501");
    await claim(); assert.equal((await read()).enabled,false); assert.equal((await reserve()).status,"disabled"); await enabled(true);
  });
  await test("anonymous/service clients cannot read sources/reserve or access raw cache tables",async()=>{
    for(const role of ["anon","service_role"]){await claim("translation_p1","player",database,role); await error(read(),"42501"); await error(reserve(),"42501");}
    for(const role of ["authenticated","anon","service_role"]){await claim("translation_p1","player",database,role); await error(query("select * from ironclad_private.match_chat_translations"),"42501");}
  });
  await resetUsage();
  await test("all eight target and source language identifiers admit cross-language pairs",async()=>{
    const langs=["en","it","zh-CN","ru","es","pt-BR","ko","fr"];
    for(let i=0;i<langs.length;i++){
      await owner(); await database.query("update ironclad_private.match_chat_translation_usage set minute_start=date_trunc('minute',clock_timestamp())-interval '1 minute',minute_attempts=0");
      await claim(); assert.equal((await reserve(M1,langs[i],langs[(i+1)%langs.length])).status,"reserved");
    }
    assert.equal((await usage()).daily[0].attempts,8);
  });
  await resetUsage();
  await test("concurrent same-key requests issue exactly one provider lease",async()=>{
    const cs=await Promise.all(Array.from({length:8},()=>connect())); await Promise.all(cs.map(c=>claim("translation_p1","player",c)));
    const rs=await Promise.all(cs.map(c=>reserve(M1,"fr","en",hash1,R1,c)));
    assert.equal(rs.filter(r=>r.status==="reserved").length,1); assert.equal(rs.filter(r=>r.status==="busy").length,7);
    const u=await usage(); assert.equal(u.daily[0].attempts,1); assert.equal(u.users[0].attempts,1);
    for(const c of cs){await c.end();clients.delete(c);}
  });
  await resetUsage();
  await test("per-minute concurrent reservations admit at most five and failed provider attempts stay charged",async()=>{
    const langs=["en","it","zh-CN","ru","es","pt-BR","ko","fr"];
    const cs=await Promise.all(langs.map(()=>connect())); await Promise.all(cs.map(c=>claim("translation_p1","player",c)));
    const rs=await Promise.all(cs.map((c,i)=>reserve(M1,langs[i],"en",hash1,R1,c)));
    assert.equal(rs.filter(r=>r.status==="reserved").length,5); assert.equal(rs.filter(r=>r.status==="rate_limited").length,3);
    const lease=rs.find(r=>r.status==="reserved").leaseId; await claim("translation_p1","player",database,"service_role"); assert.equal(await complete(lease,null),true);
    const u=await usage(); assert.equal(u.daily[0].attempts,5); assert.equal(u.users[0].attempts,5); assert.equal(u.users[0].minute_attempts,5);
    for(const c of cs){await c.end();clients.delete(c);}
  });
  await resetUsage();
  await test("per-user daily forty cap cannot be crossed concurrently",async()=>{
    await owner(); await database.query("insert into ironclad_private.match_chat_translation_usage values((clock_timestamp() at time zone 'UTC')::date,$1,39,date_trunc('minute',clock_timestamp())-interval '1 minute',0)",[P1]);
    const cs=await Promise.all([connect(),connect()]); await Promise.all(cs.map(c=>claim("translation_p1","player",c)));
    const rs=await Promise.all(cs.map((c,i)=>reserve(M1,["fr","it"][i],"en",hash1,R1,c))); assert.equal(rs.filter(r=>r.status==="reserved").length,1); assert.equal(rs.filter(r=>r.status==="rate_limited").length,1);
    assert.equal((await usage()).users[0].attempts,40); for(const c of cs){await c.end();clients.delete(c);}
  });
  await resetUsage();
  await test("global hundred cap serializes different players and rooms",async()=>{
    await owner(); await database.query("insert into ironclad_private.match_chat_translation_daily values((clock_timestamp() at time zone 'UTC')::date,99,0)");
    const cs=await Promise.all([connect(),connect(),connect()]); await Promise.all(cs.map((c,i)=>claim(["translation_p1","translation_p2","translation_p3"][i],"player",c)));
    const rs=await Promise.all([reserve(M1,"fr","en",hash1,R1,cs[0]),reserve(M1,"it","en",hash1,R1,cs[1]),reserve(M2,"ko","it",hash2,R2,cs[2])]);
    assert.equal(rs.filter(r=>r.status==="reserved").length,1); assert.equal(rs.filter(r=>r.status==="quota_exhausted").length,2); assert.equal((await usage()).daily[0].attempts,100);
    for(const c of cs){await c.end();clients.delete(c);}
  });
  await resetUsage();
  await test("global byte cap accounts UTF-8 bytes and UTC day resets ignore session time zone",async()=>{
    await owner(); await database.query("insert into ironclad_private.match_chat_translation_daily values((clock_timestamp() at time zone 'UTC')::date,0,99999)"); await claim(); assert.equal((await reserve()).status,"quota_exhausted");
    await resetUsage(); await owner(); await database.query("insert into ironclad_private.match_chat_translation_daily values((clock_timestamp() at time zone 'UTC')::date-1,100,100000)");
    await database.query("insert into ironclad_private.match_chat_translation_usage values((clock_timestamp() at time zone 'UTC')::date-1,$1,40,date_trunc('minute',clock_timestamp()),5)",[P1]);
    await database.query("set time zone 'Pacific/Kiritimati'"); await claim(); assert.equal((await reserve()).status,"reserved");
    const u=await usage(); assert.equal(u.daily.length,2); assert.equal(u.daily.find(r=>r.attempts===1).input_bytes,Buffer.byteLength((await (async()=>{await claim();return read();})()).messages[0].original,"utf8"));
    await owner(); await database.query("set time zone 'UTC'");
  });
  await resetUsage();
  await test("expired leases retry once and late old completion cannot overwrite the new lease",async()=>{
    await claim(); const first=await reserve(); await owner(); await database.query("update ironclad_private.match_chat_translations set lease_until=clock_timestamp()-interval '1 second' where lease_id=$1",[first.leaseId]);
    await claim(); const second=await reserve(); assert.equal(second.status,"reserved"); assert.notEqual(second.leaseId,first.leaseId);
    await claim("translation_p1","player",database,"service_role"); assert.equal(await complete(first.leaseId,"Old response"),false); assert.equal(await complete(second.leaseId,"Current response"),true);
    assert.equal((await usage()).daily[0].attempts,2);
  });
  await resetUsage();
  await test("source changes invalidate cache and stale hashes/late replies cannot resurrect old text",async()=>{
    await owner(); const id=uuid(799); await database.query("insert into public.match_messages(id,room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body) values($1,$2,99,'player',$3,'translation_p1',$4,'Temporary original')",[id,R1,uuid(401),randomUUID()]);
    await claim(); const oldHash=(await read(R1,[id])).messages[0].sourceHash, r=await reserve(id,"fr","en",oldHash);
    await owner(); await database.query("update public.match_messages set body='Edited original' where id=$1",[id]);
    await claim("translation_p1","player",database,"service_role"); assert.equal(await complete(r.leaseId,"Stale private text"),false);
    await claim(); assert.equal((await reserve(id,"fr","en",oldHash)).status,"unavailable");
    const newHash=(await read(R1,[id])).messages[0].sourceHash; assert.notEqual(newHash,oldHash); const fresh=await reserve(id,"fr","en",newHash);
    await owner(); await database.query("insert into ironclad_private.match_room_redactions values($1)",[id]);
    await claim(); assert.equal((await read(R1,[id])).messages[0].original,null); assert.equal((await reserve(id,"fr","en",newHash)).status,"redacted");
    await claim("translation_p1","player",database,"service_role"); assert.equal(await complete(fresh.leaseId,"Hidden source"),false);
    await owner(); await database.query("delete from public.match_messages where id=$1",[id]);
    assert.equal(await query("select count(*)::int value from ironclad_private.match_chat_translations where message_id=$1",[id]),0);
    await claim("translation_p1","player",database,"service_role"); assert.equal(await complete(fresh.leaseId,"Deleted source"),false);
  });
  await resetUsage();
  await test("provider completion waiting behind an edit/delete cannot revive superseded private text",async()=>{
    for(const action of ["edit","delete"]){
      await owner(); const id=uuid(798); await database.query("insert into public.match_messages(id,room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body) values($1,$2,98,'player',$3,'translation_p1',$4,'Race fixture original')",[id,R1,uuid(401),randomUUID()]);
      await claim(); const h=(await read(R1,[id])).messages[0].sourceHash,r=await reserve(id,"fr","en",h);
      const c=await connect(); await claim("translation_p1","player",c,"service_role");
      await owner(); await database.query("begin");
      if(action==="edit")await database.query("update public.match_messages set body='Replaced by privacy edit' where id=$1",[id]);
      else await database.query("delete from public.match_messages where id=$1",[id]);
      let settled=false;
      const pending=complete(r.leaseId,"Late forbidden response",c).finally(()=>{settled=true;});
      await delay(75); assert.equal(settled,false,"Completion should wait for the source row's in-flight edit/delete");
      await database.query("commit"); assert.equal(await pending,false);
      if(action==="edit")await database.query("delete from public.match_messages where id=$1",[id]);
      assert.equal(await query("select count(*)::int value from ironclad_private.match_chat_translations where message_id=$1",[id]),0);
      await c.end(); clients.delete(c);
    }
  });
  await resetUsage();
  await test("purged rooms and closed lease owners deny completion; flag off preserves originals only",async()=>{
    await claim(); let r=await reserve(); await owner(); await database.query("update public.match_rooms set content_purged_at=now() where id=$1",[R1]);
    await claim(); assert.equal((await read()).messages[0].original,null); assert.equal((await reserve()).status,"redacted");
    await claim("translation_p1","player",database,"service_role"); assert.equal(await complete(r.leaseId,"Purged room text"),false);
    await owner(); await database.query("update public.match_rooms set content_purged_at=null where id=$1",[R1]); await resetUsage();
    await claim(); r=await reserve(); await owner(); await database.query("update public.players set account_closed_at=now() where id=$1",[P1]);
    await claim("translation_p1","player",database,"service_role"); assert.equal(await complete(r.leaseId,"Closed actor text"),false); await owner(); await database.query("update public.players set account_closed_at=null where id=$1",[P1]);
    await enabled(false); await claim("translation_p1","player",database,"service_role"); assert.equal(await complete(r.leaseId,"Switch disabled"),false);
    await claim(); assert.ok((await read()).messages[0].original); assert.equal((await reserve()).status,"disabled");
    await owner(); assert.equal(await query("select count(*)::int value from ironclad_private.match_chat_translations where lease_id=$1",[r.leaseId]),0);
  });
  await test("completion rejects oversized/empty text and all original domain records remain identical",async()=>{
    await claim("translation_p1","player",database,"service_role"); await error(complete(randomUUID(),""),"22023"); await error(complete(randomUUID(),"x".repeat(6001)),"22023");
    assert.equal(await domain(),baseline);
  });
  assert.equal(digest(await readFile(resolve(ROOT,migrationPath),"utf8")),report.migrationSha256,"Migration changed during execution; rerun snapshot");
  report.passed=true;
} catch(e) { failure=e; report.passed=false; report.failure=e.message; report.errorCode=e.code; report.errorContext=e.where; }
finally {
  for(const c of clients) await c.end().catch(()=>{});
  if(postgres && postgres.exitCode===null){try{command("pg_ctl",["-D",DATA,"-m","fast","-w","-t","15","stop"]);}catch(e){report.stopFailure=e.message;report.passed=false;}}
  if(postgres?.exitCode===null) await Promise.race([new Promise(accept=>postgres.once("exit",accept)),delay(3000)]);
  report.stopped=!postgres || postgres.exitCode!==null; if(!report.stopped)report.passed=false;
  await writeFile(resolve(RUN,"postgres.log"),log).catch(()=>{}); await writeFile(resolve(RUN,"report.json"),`${JSON.stringify(report,null,2)}\n`).catch(()=>{}); await unlink(passwordFile).catch(()=>{});
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,stopped:report.stopped,report:resolve(RUN,"report.json"),failure:report.failure,errorCode:report.errorCode,errorContext:report.errorContext},null,2));
}
if(failure)console.error(failure.message);
if(!report.passed)process.exitCode=1;
