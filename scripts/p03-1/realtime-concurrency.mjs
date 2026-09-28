import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localClient, localPsqlArgument } from "./local-pg.mjs";

const root = process.cwd();
const template = JSON.parse(readFileSync(path.join(root, "scripts/p03-1/database-evidence.json"), "utf8")).database;
assert(/^p03_realtime_\d+$/.test(template));
const database = "p03_realtime_race_" + Date.now();
const client = localClient(localPsqlArgument(), { database });
const id = (n) => "d19a0000-0000-4000-8000-" + String(n).padStart(12, "0");
const actor = (sql, n = 1) => `set role authenticated;set request.jwt.claims='{"role":"authenticated","sub":"match-room-test-${n}","metadata":{"role":"player"}}';${sql}`;
const checks = [];
const pass = (name) => { checks.push(name); console.log("PASS " + name); };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function hold(sql) {
  const request = client.start("begin;" + sql + "\n\\echo P031_READY", { interactive: true });
  const deadline = Date.now() + 10_000;
  while (!request.stdout.includes("P031_READY")) {
    assert(Date.now() < deadline, request.stderr || "Session did not reach synchronization point");
    await delay(30);
  }
  return request;
}
async function release(request, commit = true) {
  request.child.stdin.end(commit ? "commit;\n" : "rollback;\n");
  const result = await request.done;
  assert.equal(result.code, 0, result.stderr);
}

assert.equal(await client.run("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623;", { db: "postgres" }), "t");
await client.run(`create database ${database} template ${template};`, { db: "postgres" });
try {
  const fixture = readFileSync(path.join(root, "tests/database/match-room-phase-1.sql"), "utf8");
  await client.run(fixture.slice(fixture.indexOf("begin;"), fixture.indexOf("-- Physical boundary:")) + "\ncommit;");
  const resolved = await client.run(actor(`select public.resolve_match_room('${id(311)}');`));
  const room = JSON.parse(resolved.split(/\r?\n/).at(-1)).room.id;
  const topic = `match-room:${room}:1`;
  const send = (n) => actor(`select public.send_match_room_message('${id(311)}','${room}','${id(9500+n)}','Synthetic race fixture');`);
  const sending = await hold(send(1));
  assert.equal(await client.run("select count(*) from realtime.messages;"), "0");
  assert.equal(await client.run("select count(*) from public.match_messages;"), "0");
  await release(sending);
  assert.equal(await client.run("select count(*) from realtime.messages;"), "1");
  pass("another session sees neither event nor message until sender transaction commits");

  const rollingBack = await hold(send(2));
  assert.equal(await client.run("select count(*) from realtime.messages;"), "1");
  await release(rollingBack, false);
  assert.equal(await client.run("select count(*) from realtime.messages;"), "1");
  pass("rolled-back sender transaction never exposes a broadcast event");

  const firstRetry = await hold(send(3));
  const secondRetry = client.start(send(3), { app: "p031-idempotent-retry" });
  const deadline = Date.now() + 10_000;
  while (await client.run("select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='p031-idempotent-retry' and wait_event_type='Lock');") !== "t") {
    assert(Date.now() < deadline); await delay(30);
  }
  await release(firstRetry);
  const retried = await secondRetry.done;
  assert.equal(retried.code, 0, retried.stderr);
  assert.equal(JSON.parse(retried.stdout.split(/\r?\n/).at(-1)).duplicate, true);
  assert.equal(await client.run("select count(*) from realtime.messages;"), "2");
  pass("concurrent idempotent retries persist one message and one invalidation");

  const reassigning = await hold(`update public.tournament_matches set player_two_registration_id='${id(213)}' where id='${id(311)}';`);
  assert.equal(await client.run(actor(`select ironclad_private.can_receive_match_room_realtime('${topic}');`, 2)), "t");
  assert.equal(await client.run("select count(*) from realtime.messages;"), "2");
  await release(reassigning);
  assert.equal(await client.run(actor(`select ironclad_private.can_receive_match_room_realtime('${topic}');`, 2)), "f");
  assert.equal(await client.run(`select count(*) from realtime.messages where topic='${topic}';`), "3");
  const replacement = JSON.parse((await client.run(actor(`select public.resolve_match_room('${id(311)}');`, 3))).split(/\r?\n/).at(-1)).room;
  await client.run(actor(`select public.send_match_room_message('${id(311)}','${replacement.id}','${id(9510)}','Synthetic replacement fixture');`, 3));
  assert.equal(await client.run(`select count(*) from realtime.messages where topic='${topic}';`), "3");
  assert.equal(await client.run(`select count(*) from realtime.messages where topic='match-room:${replacement.id}:${replacement.communicationGeneration}';`), "1");
  pass("reassignment commits old-topic invalidation atomically and all later events use new generation only");
  writeFileSync(path.join(root, "scripts/p03-1/realtime-concurrency-evidence.json"), JSON.stringify({ testedAt: new Date().toISOString(), status: "PASS", checks }, null, 2) + "\n");
} finally {
  for (const request of client.processes) request.child.kill();
  await client.run(`drop database ${database} with (force);`, { db: "postgres" });
}
