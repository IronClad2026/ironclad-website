// P03_PG_PORT=56624 node tests/database/caster-phase4-coverage.mjs /path/to/local/psql
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { localClient, localPsqlArgument } from "../../scripts/p03-1/local-pg.mjs";

const read = (file) => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
const database = "p03_caster_phase4_" + Date.now();
const client = localClient(localPsqlArgument(), { database });
const service = (sql) => client.run(`
  set role service_role;
  set request.jwt.claims = '{"role":"service_role"}';
  ${sql}
`);

assert.equal(await client.run(
  `select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${client.port};`, { db: "postgres" },
), "t");
assert.equal(await client.run(
  `select count(*) from pg_database where datname='${database}';`, { db: "postgres" },
), "0", "Refuse to overwrite a database");
await client.run(`create database ${database};`, { db: "postgres" });

const assertProtected = (role, sql) => assert.rejects(client.run(`
  set role ${role};
  set request.jwt.claims = '{"role":"${role}","sub":"user_CasterPhase3Owner"}';
  ${sql}
`), /permission denied/i);
const uuid = (n) => "ca570004-0000-4000-8000-" + String(n).padStart(12, "0");

try {
  await client.run(read("tests/database/local-supabase-replay-prelude.sql") + "\n"
    + read("tests/database/match-room-realtime-local-prelude.sql"));
  const migrations = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    try {
      await client.run(read("supabase/migrations/" + name).replace(
        /^create extension if not exists (?:pg_net|pg_cron) with schema extensions;\r?$/gm,
        "-- Local-only non-networking signatures are provided by the replay prelude.",
      ));
    } catch (error) {
      throw new Error("Migration " + name + ": " + error.message, { cause: error });
    }
  }
  console.log("PASS disposable PostgreSQL migration replay: " + migrations.length);

  await client.run(read("tests/database/caster-phase3-publication.sql"));
  await client.run(read("tests/database/caster-phase4-coverage.sql"));
  console.log("PASS Phase 3 regressions and Phase 4 lifecycle, scope ancestry, permissions, media and history");
  await assertProtected("anon", `select public.caster_phase4_public_schedules(array['${uuid(1)}'::uuid]);`);
  await assertProtected("authenticated", "select public.caster_phase4_owner('user_CasterPhase3Owner');");
  await assertProtected("service_role", "select * from ironclad_private.caster_assignment_events;");
  await assert.rejects(service(`
    select public.caster_phase4_admin_list('user_CasterPhase3Other',null,null,0);
  `), /Caster staff access required/i);
  console.log("PASS direct client, raw service table and non-staff administration denials");

  const duplicate = () => service(`
    select public.caster_phase4_admin_assign('user_CasterPhase3Staff',array[
      (select (a->>'application_id')::uuid from jsonb_array_elements(
        public.caster_phase3_admin_list('user_CasterPhase3Staff','active','user_CasterPhase3Race',0)->'casters') a)
    ],'${uuid(2)}','${uuid(12)}',null,null,null,null,null,false,null)->>'status';
  `);
  const duplicateResults = await Promise.all([duplicate(), duplicate()]);
  assert.deepEqual(duplicateResults.sort(), ["duplicate", "ok"]);
  console.log("PASS simultaneous assignment creation commits one active record");

  const decisionId = await service(`
    select public.caster_phase4_admin_list('user_CasterPhase3Staff','${uuid(2)}',null,0)#>>'{assignments,0,id}';
  `);
  assert.match(decisionId, /^[0-9a-f-]{36}$/);
  const decide = (action) => service(`
    select public.caster_phase4_admin_save('user_CasterPhase3Staff','${decisionId}',1,null,null,null,null,'${action}',
      null,now()-interval '1 hour',null,null,null,false,'Synthetic decision concurrency')->>'status';
  `);
  const decisions = await Promise.all([decide("complete"), decide("cancel")]);
  assert.deepEqual(decisions.sort(), ["conflict", "ok"]);
  assert.equal(await service(`
    select jsonb_array_length(public.caster_phase4_admin_history('user_CasterPhase3Staff','${decisionId}')->'events');
  `), "2");
  console.log("PASS concurrent decisions preserve one transition and one audit event");

  const closedId = await service(`
    select public.caster_phase4_admin_assign('user_CasterPhase3Staff',array[
      (select (a->>'application_id')::uuid from jsonb_array_elements(
        public.caster_phase3_admin_list('user_CasterPhase3Staff','active','user_CasterPhase3Closed',0)->'casters') a)
    ],'${uuid(2)}',null,null,null,null,null,null,false,null)#>>'{assignments,0,id}';
  `);
  assert.match(closedId, /^[0-9a-f-]{36}$/);
  const [complete, close] = await Promise.all([
    service(`
      select public.caster_phase4_admin_save('user_CasterPhase3Staff','${closedId}',1,null,null,null,null,'complete',
        null,now()-interval '1 hour',null,null,null,false,null)->>'status';
    `),
    service("select public.close_ironclad_player_account('user_CasterPhase3Closed')->>'outcome';"),
  ]);
  assert.equal(close, "not_found");
  assert.ok(["ok", "closed"].includes(complete), complete);
  assert.equal(await service("select public.caster_phase4_owner('user_CasterPhase3Closed')->>'status';"), "closed");
  assert.equal(await service(`
    select public.caster_phase4_admin_save('user_CasterPhase3Staff','${closedId}',${complete === "ok" ? 2 : 1},
      null,null,null,null,'${complete === "ok" ? "correct" : "complete"}',
      null,now()-interval '1 hour',null,null,null,false,'Attempt to edit after closure')->>'status';
  `), "closed");
  console.log("PASS concurrent Patch 2 closure and completion cannot retain caster access or permit later verification edits");
} finally {
  await client.run(`drop database ${database};`, { db: "postgres" });
}
